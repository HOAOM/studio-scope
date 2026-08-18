/**
 * tierLimits — helper client per i limiti di piano applicati lato server.
 *
 * L'enforcement vero e proprio vive nel database:
 *  - trigger su organization_members / organization_invites (posti)
 *  - trigger su projects (progetti attivi)
 *  - trigger su project_items (voci BOQ)
 *  - policy INSERT su storage.objects (spazio occupato)
 * I numeri sono configurabili dai platform admin nella tabella `tier_limits`.
 *
 * Qui ci limitiamo a: (a) pre-controllo dello spazio prima di un upload,
 * così l'utente riceve un messaggio chiaro invece dell'errore RLS generico;
 * (b) traduzione degli errori del database in messaggi comprensibili.
 */
import { supabase } from '@/integrations/supabase/client';

export const UPGRADE_HINT = 'Serve un upgrade di piano per continuare.';

export interface OrgLimitsUsage {
  organization_id: string;
  tier: 'basic' | 'advanced' | 'pro';
  seats_used: number;
  max_seats: number | null;
  projects_used: number;
  max_active_projects: number | null;
  storage_used_bytes: number;
  max_storage_bytes: number | null;
  max_boq_items_per_project: number | null;
}

export async function fetchOrgLimitsUsage(orgId?: string): Promise<OrgLimitsUsage | null> {
  const { data, error } = await (supabase as any).rpc('my_org_limits_usage', {
    p_org: orgId ?? null,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as OrgLimitsUsage) ?? null;
}

/** Messaggio leggibile per un errore proveniente dal database/storage. */
export function describeTierError(error: unknown): string {
  const msg = (error as any)?.message ?? String(error ?? '');
  if (/Limite (posti|progetti|voci)/i.test(msg)) return msg;
  if (/row-level security policy for table "objects"/i.test(msg)) {
    return `Spazio di archiviazione esaurito per il piano attuale. ${UPGRADE_HINT}`;
  }
  return msg || 'Operazione non riuscita.';
}

/**
 * Pre-controllo di quota prima di un upload. Ritorna un messaggio d'errore
 * chiaro se lo spazio del piano è esaurito, altrimenti null.
 */
export async function checkUploadQuota(bucket: string, path: string): Promise<string | null> {
  const { data, error } = await (supabase as any).rpc('storage_upload_within_limit', {
    p_bucket: bucket,
    p_name: path,
  });
  if (error) return null; // in dubbio lasciamo decidere al server
  if (data === false) {
    return `Spazio di archiviazione esaurito per il piano del tuo studio. ${UPGRADE_HINT}`;
  }
  return null;
}

/** Upload con pre-controllo di quota e messaggi chiari. */
export async function uploadWithQuota(
  bucket: string,
  path: string,
  file: File | Blob,
  options?: { upsert?: boolean },
): Promise<void> {
  const blocked = await checkUploadQuota(bucket, path);
  if (blocked) throw new Error(blocked);
  const { error } = await supabase.storage.from(bucket).upload(path, file, options);
  if (error) throw new Error(describeTierError(error));
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '∞';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
