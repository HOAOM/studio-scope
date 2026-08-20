/**
 * Restituisce (riusando se già presente) l'unsubscribe_token per un indirizzo email.
 * L'API email rifiuta con 400 `missing_unsubscribe` ogni invio con
 * purpose="transactional" privo di questo token.
 */
export async function getUnsubscribeToken(
  admin: { from: (t: string) => any },
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();

  const { data: existing } = await admin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .is("used_at", null)
    .limit(1)
    .maybeSingle();

  if (existing?.token) return existing.token as string;

  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

  const { error } = await admin
    .from("email_unsubscribe_tokens")
    .insert({ token, email: normalized });

  if (error) {
    // Race: un altro invio ha appena creato il token → rileggilo.
    const { data: retry } = await admin
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", normalized)
      .is("used_at", null)
      .limit(1)
      .maybeSingle();
    return (retry?.token as string) ?? null;
  }

  return token;
}
