/**
 * orgContext — guardia server-side contro la scrittura sull'organizzazione
 * sbagliata durante il View-as (impersonazione di un platform admin).
 *
 * Problema strutturale: le edge function che ricevono `organization_id` dal
 * client si fidavano dell'org "ambientale" scelta dal frontend. Un platform
 * admin in View-as (che NON è membro dell'org impersonata) poteva quindi
 * generare scritture — inviti, ruoli, membri — sulla PROPRIA organizzazione.
 *
 * Regola:
 *   - membro / admin / owner dell'org  -> sempre consentito
 *   - platform admin con sessione di impersonazione aperta su QUELLA org -> ok
 *   - platform admin dalla console super-admin (org scelta esplicitamente in UI,
 *     `consoleIntent: true`) -> ok
 *   - platform admin senza nessuno dei due -> RIFIUTATO (contesto ambiguo)
 */

export interface OrgAccessInput {
  isPlatformAdmin: boolean;
  isOrgMember: boolean;
  impersonatingOrgId: string | null;
  targetOrgId: string;
  consoleIntent?: boolean;
}

export interface OrgAccessDecision {
  allowed: boolean;
  reason: 'member' | 'impersonation' | 'console' | 'ambiguous_platform_context' | 'not_authorized';
}

/** Decisione PURA (testabile) sull'accesso a un'organizzazione. */
export function decideOrgAccess(input: OrgAccessInput): OrgAccessDecision {
  if (input.isOrgMember) return { allowed: true, reason: 'member' };
  if (!input.isPlatformAdmin) return { allowed: false, reason: 'not_authorized' };
  if (input.impersonatingOrgId && input.impersonatingOrgId === input.targetOrgId) {
    return { allowed: true, reason: 'impersonation' };
  }
  if (input.consoleIntent) return { allowed: true, reason: 'console' };
  return { allowed: false, reason: 'ambiguous_platform_context' };
}

/** Org attualmente impersonata dall'utente (sessione aperta), o null. */
export async function currentImpersonationOrg(
  admin: any,
  userId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('platform_impersonation_log')
    .select('target_organization_id')
    .eq('actor_user_id', userId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.target_organization_id ?? null;
}

/**
 * Verifica completa. Lancia un errore con `status` se il contesto non è valido.
 * `isOrgMember` va calcolato dal chiamante (owner / org admin / membro).
 */
export async function assertOrgContext(
  admin: any,
  opts: {
    userId: string;
    targetOrgId: string;
    isPlatformAdmin: boolean;
    isOrgMember: boolean;
    consoleIntent?: boolean;
  },
): Promise<OrgAccessDecision> {
  const impersonatingOrgId =
    opts.isPlatformAdmin && !opts.isOrgMember
      ? await currentImpersonationOrg(admin, opts.userId)
      : null;

  const decision = decideOrgAccess({
    isPlatformAdmin: opts.isPlatformAdmin,
    isOrgMember: opts.isOrgMember,
    impersonatingOrgId,
    targetOrgId: opts.targetOrgId,
    consoleIntent: opts.consoleIntent,
  });

  if (!decision.allowed) {
    const err: any = new Error(
      decision.reason === 'ambiguous_platform_context'
        ? "Contesto organizzazione ambiguo: apri una sessione View-as sull'organizzazione di destinazione prima di eseguire questa operazione."
        : 'Non autorizzato su questa organizzazione.',
    );
    err.status = 403;
    err.code = decision.reason;
    throw err;
  }
  return decision;
}
