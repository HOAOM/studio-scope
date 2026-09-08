/**
 * tierError — legge l'errore strutturato prodotto dai trigger di limite piano.
 * Il blocco resta a database: qui interpretiamo solo il dettaglio JSON allegato
 * all'eccezione, per poter mostrare in futuro un upsell mirato.
 */
export type TierLimitResource = 'active_projects' | 'seats' | 'boq_items' | string;

export interface TierLimitError {
  code: 'TIER_LIMIT_REACHED';
  resource: TierLimitResource;
  current: number;
  limit: number;
  current_tier: string;
  suggested_tier: string;
}

/** Restituisce l'errore strutturato se presente, altrimenti null. */
export function parseTierLimitError(error: unknown): TierLimitError | null {
  const detail = (error as any)?.details ?? (error as any)?.detail ?? null;
  const candidates = [detail, (error as any)?.message];
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const start = c.indexOf('{');
    if (start === -1) continue;
    try {
      const parsed = JSON.parse(c.slice(start, c.lastIndexOf('}') + 1));
      if (parsed?.code === 'TIER_LIMIT_REACHED') return parsed as TierLimitError;
    } catch { /* non è un errore strutturato */ }
  }
  return null;
}

const RESOURCE_LABEL: Record<string, string> = {
  active_projects: 'progetti attivi',
  seats: 'persone nello studio',
  boq_items: 'voci BOQ nel progetto',
};

export function describeTierLimit(e: TierLimitError): string {
  const label = RESOURCE_LABEL[e.resource] ?? e.resource;
  return `Hai raggiunto il limite di ${e.limit} ${label} del piano ${e.current_tier}. `
    + `Passa al piano ${e.suggested_tier} per continuare.`;
}
