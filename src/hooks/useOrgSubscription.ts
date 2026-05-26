/**
 * useOrgSubscription — DB-backed organization subscription summary.
 *
 * Replaces (over time) the localStorage-only `useSubscriptionTier` for
 * cases where we must trust the server: project creation gating, storage
 * quota checks, feature flags that affect billing.
 *
 * Server-side truth lives in `public.organization_subscriptions` and is
 * exposed by the RPC `get_my_org_subscription_summary` (returns the
 * caller's primary org). Tier/limits cannot be bypassed by clearing
 * localStorage — a BEFORE INSERT trigger on `public.projects` enforces
 * the project count limit at the DB level.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type OrgTier = 'starter' | 'pro' | 'business';
export type OrgStatus = 'active' | 'grace' | 'suspended' | 'purge_pending' | 'purged';

export interface OrgSubscriptionSummary {
  organization_id: string;
  organization_name: string;
  tier: OrgTier;
  status: OrgStatus;
  current_period_end: string | null;
  project_limit: number;
  projects_used: number;
  storage_limit_bytes: number;
}

export function useOrgSubscription() {
  return useQuery<OrgSubscriptionSummary | null>({
    queryKey: ['org-subscription-summary'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_my_org_subscription_summary');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as OrgSubscriptionSummary) ?? null;
    },
  });
}

/** Convenience: throw-on-error project-create guard for UI. */
export function describeTierBlock(sub: OrgSubscriptionSummary | null | undefined): string | null {
  if (!sub) return null;
  if (sub.projects_used >= sub.project_limit) {
    return `Hai raggiunto il limite di ${sub.project_limit} progetti attivi del piano ${sub.tier}. Archivia un progetto o passa a un piano superiore.`;
  }
  return null;
}
