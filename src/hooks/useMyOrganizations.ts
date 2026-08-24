/**
 * useMyOrganizations — list of organizations the current user belongs to,
 * plus a localStorage-persisted "active org" selector.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MyOrg {
  organization_id: string;
  name: string;
  slug: string;
  is_owner: boolean;
  tier: string;
  status: string;
}

const ACTIVE_ORG_KEY = 'studioscope.activeOrgId';
/** Deve restare allineata a IMPERSONATE_KEY in ImpersonateBanner.tsx (import evitato per non creare cicli). */
const IMPERSONATE_KEY = 'studioscope.impersonateOrgId';

/**
 * Risoluzione PURA dell'organizzazione attiva.
 *
 * Regola non negoziabile: se e' aperta una sessione di View-as (impersonazione),
 * l'org impersonata VINCE SEMPRE, anche se il platform admin non ne e' membro.
 * Senza questa regola ogni scrittura "ambientale" (inviti, membri, organigramma,
 * calendario, fornitori, company settings...) finiva silenziosamente nell'org
 * del platform admin.
 */
export function resolveActiveOrgId(args: {
  orgs: Pick<MyOrg, 'organization_id'>[] | undefined;
  storedId: string | null;
  impersonatedId: string | null;
}): string | null {
  const { orgs, storedId, impersonatedId } = args;
  if (impersonatedId) return impersonatedId;
  if (!orgs || orgs.length === 0) return storedId;
  const storedValid = orgs.some((o) => o.organization_id === storedId);
  return storedValid ? storedId : orgs[0].organization_id;
}


export function useMyOrganizations() {
  return useQuery<MyOrg[]>({
    queryKey: ['my-organizations'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_my_organizations');
      if (error) throw error;
      return (data ?? []) as MyOrg[];
    },
  });
}

const ACTIVE_ORG_EVENT = 'studioscope.active-org-change';

/** Scrive l'org attiva e notifica TUTTE le istanze dell'hook (stessa tab + altre tab). */
function writeActiveOrg(id: string) {
  localStorage.setItem(ACTIVE_ORG_KEY, id);
  window.dispatchEvent(new Event(ACTIVE_ORG_EVENT));
}

export function useActiveOrg() {
  const { data: orgs, isLoading } = useMyOrganizations();
  const [activeId, setActiveIdState] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : localStorage.getItem(ACTIVE_ORG_KEY),
  );

  // Sincronizzazione cross-istanza: senza questo, cambiare org in OrgSwitcher
  // aggiornava solo lo state locale di quel componente e le query (progetti,
  // ruoli, admin data…) restavano sulla vecchia org.
  useEffect(() => {
    const sync = () => setActiveIdState(localStorage.getItem(ACTIVE_ORG_KEY));
    window.addEventListener(ACTIVE_ORG_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ACTIVE_ORG_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // Auto-pick first org if nothing selected / selezione non più valida.
  // La risoluzione avviene anche in modo SINCRONO qui sotto (resolvedId) per
  // evitare il flash con l'org precedente prima che l'effect giri.
  const storedValid = !!orgs && orgs.some((o) => o.organization_id === activeId);
  const resolvedId = orgs && orgs.length > 0
    ? (storedValid ? activeId : orgs[0].organization_id)
    : activeId;

  useEffect(() => {
    if (!orgs || orgs.length === 0) return;
    if (resolvedId && resolvedId !== activeId) {
      writeActiveOrg(resolvedId);
      setActiveIdState(resolvedId);
    }
  }, [orgs, activeId, resolvedId]);

  const setActiveOrg = useCallback((id: string) => {
    writeActiveOrg(id);
    setActiveIdState(id);
  }, []);

  const activeOrg = orgs?.find((o) => o.organization_id === resolvedId) ?? null;
  return { orgs: orgs ?? [], activeOrg, activeId: resolvedId, setActiveOrg, isLoading };
}


