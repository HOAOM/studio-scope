/**
 * useBilling — dati reali di piano, utilizzo e cambio piano per l'organizzazione
 * attiva. Non introduce logica di limite: legge ciò che il database già calcola
 * (`my_org_limits_usage`, `organization_entitlements`, `downgrade_preview`) e
 * usa le funzioni esistenti per applicare i cambi (`request_tier_upgrade`,
 * `apply_downgrade`).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveOrg } from '@/hooks/useMyOrganizations';

export type BillingTier = 'basic' | 'advanced' | 'pro' | 'enterprise';

export const TIER_ORDER: BillingTier[] = ['basic', 'advanced', 'pro', 'enterprise'];

export const TIER_LABEL: Record<BillingTier, string> = {
  basic: 'Basic',
  advanced: 'Advanced',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

export const STATUS_LABEL: Record<string, string> = {
  active: 'Attivo',
  trialing: 'In prova',
  past_due: 'Pagamento in ritardo',
  grace: 'Periodo di tolleranza',
  suspended: 'Sospeso',
  canceled: 'Disdetto',
  purge_pending: 'In cancellazione',
  purged: 'Cancellato',
};

export interface OrgUsage {
  organization_id: string;
  tier: BillingTier;
  seats_used: number;
  max_seats: number | null;
  projects_used: number;
  max_active_projects: number | null;
  storage_used_bytes: number;
  max_storage_bytes: number | null;
  max_boq_items_per_project: number | null;
  max_users_per_role: number | null;
  max_addons: number | null;
  max_roles_per_user: number | null;
  max_super_role_extra: number | null;
  super_roles_used: number;
  archive_retention_hours: number | null;
}

export interface Entitlement {
  organization_id: string;
  tier: BillingTier;
  status: string;
  current_period_end: string | null;
  trial_ends_at: string | null;
}

export interface RoleUsage {
  /** ruolo -> numero di persone distinte con quel ruolo */
  perRole: { role: string; count: number }[];
  /** persona con più ruoli cumulati */
  maxRolesPerUser: number;
}

export function useOrgUsage() {
  const { activeOrgId } = useActiveOrg();
  return useQuery<OrgUsage | null>({
    queryKey: ['org-usage', activeOrgId],
    enabled: !!activeOrgId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('my_org_limits_usage', {
        p_org: activeOrgId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as OrgUsage) ?? null;
    },
  });
}

export function useEntitlement() {
  const { activeOrgId } = useActiveOrg();
  return useQuery<Entitlement | null>({
    queryKey: ['org-entitlement', activeOrgId],
    enabled: !!activeOrgId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('organization_entitlements')
        .select('organization_id, tier, status, current_period_end, trial_ends_at')
        .eq('organization_id', activeOrgId)
        .maybeSingle();
      if (error) throw error;
      return (data as Entitlement) ?? null;
    },
  });
}

/** Conteggio persone distinte per ruolo e massimo di ruoli cumulati su una persona. */
export function useRoleUsage() {
  const { activeOrgId } = useActiveOrg();
  return useQuery<RoleUsage>({
    queryKey: ['org-role-usage', activeOrgId],
    enabled: !!activeOrgId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('user_roles')
        .select('role, user_id')
        .eq('organization_id', activeOrgId);
      if (error) throw error;
      const rows = (data ?? []) as { role: string; user_id: string }[];
      const byRole = new Map<string, Set<string>>();
      const byUser = new Map<string, Set<string>>();
      for (const r of rows) {
        if (!byRole.has(r.role)) byRole.set(r.role, new Set());
        byRole.get(r.role)!.add(r.user_id);
        if (!byUser.has(r.user_id)) byUser.set(r.user_id, new Set());
        byUser.get(r.user_id)!.add(r.role);
      }
      return {
        perRole: [...byRole.entries()]
          .map(([role, users]) => ({ role, count: users.size }))
          .sort((a, b) => b.count - a.count || a.role.localeCompare(b.role)),
        maxRolesPerUser: [...byUser.values()].reduce((m, s) => Math.max(m, s.size), 0),
      };
    },
  });
}

export interface DowngradePreview {
  target_tier: string;
  blocking: boolean;
  active_projects: {
    current: number;
    limit: number | null;
    must_release: number;
    candidates: { id: string; code: string | null; name: string; created_at: string }[];
  };
  seats: { current: number; limit: number | null; must_release: number };
  storage: { current: number; limit: number | null; must_release: number };
}

export function useDowngradePreview(target: BillingTier | null) {
  const { activeOrgId } = useActiveOrg();
  return useQuery<DowngradePreview | null>({
    queryKey: ['downgrade-preview', activeOrgId, target],
    enabled: !!activeOrgId && !!target,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('downgrade_preview', {
        p_org: activeOrgId,
        p_target: target,
      });
      if (error) throw error;
      return (data as DowngradePreview) ?? null;
    },
  });
}

export function useTierMutations() {
  const { activeOrgId } = useActiveOrg();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['org-usage'] });
    qc.invalidateQueries({ queryKey: ['org-entitlement'] });
    qc.invalidateQueries({ queryKey: ['downgrade-preview'] });
    qc.invalidateQueries({ queryKey: ['org-subscription-summary'] });
    qc.invalidateQueries({ queryKey: ['projects'] });
  };

  const upgrade = useMutation({
    mutationFn: async (target: BillingTier) => {
      const { data, error } = await (supabase as any).rpc('request_tier_upgrade', {
        p_org: activeOrgId,
        p_target: target,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const downgrade = useMutation({
    mutationFn: async (args: { target: BillingTier; archiveProjectIds: string[] }) => {
      const { data, error } = await (supabase as any).rpc('apply_downgrade', {
        p_org: activeOrgId,
        p_target: args.target,
        p_archive_project_ids: args.archiveProjectIds,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  return { upgrade, downgrade };
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}
