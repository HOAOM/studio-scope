/**
 * useAllOrganizations — admin-only view of every organization on the platform.
 * Backed by RPC admin_list_all_orgs which itself enforces is_platform_admin().
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AllOrgRow {
  organization_id: string;
  name: string;
  slug: string;
  created_at: string;
  owner_email: string | null;
  owner_user_id: string | null;
  tier: 'basic' | 'advanced' | 'pro';
  status: 'active' | 'grace' | 'suspended' | 'purge_pending';
  current_period_end: string | null;
  active_projects: number;
  project_limit: number;
}

export function useAllOrganizations(enabled = true) {
  return useQuery<AllOrgRow[]>({
    queryKey: ['admin-all-orgs'],
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('admin_list_all_orgs');
      if (error) throw error;
      return (data ?? []) as AllOrgRow[];
    },
  });
}

export function useGlobalMetrics(enabled = true) {
  return useQuery({
    queryKey: ['admin-global-metrics'],
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('admin_global_metrics');
      if (error) throw error;
      return data as {
        total_orgs: number;
        orgs_by_tier: Record<string, number>;
        orgs_by_status: Record<string, number>;
        new_orgs_30d: number;
        total_projects: number;
        top_orgs: { name: string; active_projects: number }[];
      };
    },
  });
}
