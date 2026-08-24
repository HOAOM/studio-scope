/**
 * useEffectiveOwner — controparte client di `effectiveOwnerContext()`
 * (supabase/functions/_shared/orgContext.ts).
 *
 * Principio unico: un platform admin in View-as eredita i diritti dell'owner
 * reale dell'organizzazione impersonata. La UI non deve più contenere gate
 * ad-hoc del tipo `activeOrg.is_owner` sparsi per singola azione: ogni pannello
 * chiede `isEffectiveOwner` e passa `consoleIntent` alle edge function.
 */
import { useActiveOrg } from '@/hooks/useMyOrganizations';

export interface EffectiveOwner {
  organizationId: string | null;
  /** Può fare tutto ciò che può l'owner reale (owner o platform admin in View-as). */
  isEffectiveOwner: boolean;
  /** Owner reale, senza impersonazione. */
  isRealOwner: boolean;
  isImpersonating: boolean;
  /** Da inoltrare alle edge function come `console_intent`. */
  consoleIntent: boolean;
  isLoading: boolean;
}

/** Regola PURA, testabile senza React. */
export function computeEffectiveOwnerClient(args: {
  isRealOwner: boolean;
  isImpersonating: boolean;
}): boolean {
  return args.isRealOwner || args.isImpersonating;
}

export function useEffectiveOwner(): EffectiveOwner {
  const { activeOrg, activeId, isImpersonating, isLoading } = useActiveOrg();
  const isRealOwner = !!activeOrg?.is_owner && !isImpersonating;

  return {
    organizationId: activeId,
    isRealOwner,
    isImpersonating,
    isEffectiveOwner: computeEffectiveOwnerClient({ isRealOwner, isImpersonating }),
    consoleIntent: isImpersonating,
    isLoading,
  };
}
