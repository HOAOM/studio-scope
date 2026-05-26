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

export function useActiveOrg() {
  const { data: orgs, isLoading } = useMyOrganizations();
  const [activeId, setActiveIdState] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : localStorage.getItem(ACTIVE_ORG_KEY),
  );

  // Auto-pick first org if nothing selected
  useEffect(() => {
    if (!orgs || orgs.length === 0) return;
    if (!activeId || !orgs.find((o) => o.organization_id === activeId)) {
      const next = orgs[0].organization_id;
      setActiveIdState(next);
      localStorage.setItem(ACTIVE_ORG_KEY, next);
    }
  }, [orgs, activeId]);

  const setActiveOrg = useCallback((id: string) => {
    localStorage.setItem(ACTIVE_ORG_KEY, id);
    setActiveIdState(id);
  }, []);

  const activeOrg = orgs?.find((o) => o.organization_id === activeId) ?? null;
  return { orgs: orgs ?? [], activeOrg, activeId, setActiveOrg, isLoading };
}
