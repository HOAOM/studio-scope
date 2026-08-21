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

  // Auto-pick first org if nothing selected
  useEffect(() => {
    if (!orgs || orgs.length === 0) return;
    if (!activeId || !orgs.find((o) => o.organization_id === activeId)) {
      writeActiveOrg(orgs[0].organization_id);
      setActiveIdState(orgs[0].organization_id);
    }
  }, [orgs, activeId]);

  const setActiveOrg = useCallback((id: string) => {
    writeActiveOrg(id);
    setActiveIdState(id);
  }, []);

  const activeOrg = orgs?.find((o) => o.organization_id === activeId) ?? null;
  return { orgs, activeOrg, activeId, setActiveOrg, isLoading };
}

