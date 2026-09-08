/**
 * billing.ts — livello condiviso, volutamente diviso in due:
 *  - mapEntitlement(): traduce lo stato del FORNITORE in diritti dell'organizzazione
 *  - le tabelle organization_entitlements NON contengono mai campi del fornitore
 * Cambiare fornitore = riscrivere solo questo mapping + il webhook handler.
 */
export type EntitlementStatus =
  | 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled';
export type Tier = 'basic' | 'advanced' | 'pro' | 'enterprise';

/** Stati Lemon Squeezy -> stati diritti (provider-agnostici). */
export function mapLemonStatus(s: string | null | undefined): EntitlementStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'on_trial': return 'trialing';
    case 'active': return 'active';
    case 'past_due': return 'past_due';
    case 'paused':
    case 'unpaid': return 'suspended';
    case 'cancelled':
    case 'canceled':
    case 'expired': return 'canceled';
    default: return 'suspended';
  }
}

/** Verifica firma HMAC-SHA256 esadecimale (X-Signature) di Lemon Squeezy. */
export async function verifyLemonSignature(
  rawBody: string, signature: string | null, secret: string,
): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const digest = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  const a = new TextEncoder().encode(digest);
  const b = new TextEncoder().encode(signature.trim().toLowerCase());
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
