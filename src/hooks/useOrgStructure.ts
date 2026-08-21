/**
 * useOrgStructure — teams, team memberships and organigram positions
 * for the ACTIVE organization. RLS is authoritative; the UI only decides
 * what to show / enable.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveOrg } from '@/hooks/useMyOrganizations';
import { useAuth } from '@/hooks/useAuth';

const sb = supabase as any;

export interface Team {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  discipline: string | null;
  color: string | null;
  is_active: boolean;
}

export interface TeamMember {
  id: string;
  team_id: string;
  organization_id: string;
  user_id: string;
  member_role: 'member' | 'lead';
  valid_from: string | null;
  valid_to: string | null;
}

export interface OrgPosition {
  id: string;
  organization_id: string;
  title: string;
  user_id: string | null;
  team_id: string | null;
  manager_id: string | null;
  base_role: string | null;
  x: number;
  y: number;
  sort_order: number;
  notes: string | null;
}

export interface DirectoryProfile {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export function useTeams() {
  const { activeId } = useActiveOrg();
  return useQuery({
    queryKey: ['teams', activeId],
    enabled: !!activeId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from('teams')
        .select('*')
        .eq('organization_id', activeId)
        .order('name');
      if (error) throw error;
      return (data || []) as Team[];
    },
  });
}

export function useTeamMembers() {
  const { activeId } = useActiveOrg();
  return useQuery({
    queryKey: ['team-members', activeId],
    enabled: !!activeId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from('team_members')
        .select('*')
        .eq('organization_id', activeId);
      if (error) throw error;
      return (data || []) as TeamMember[];
    },
  });
}

export function useOrgPositions() {
  const { activeId } = useActiveOrg();
  return useQuery({
    queryKey: ['org-positions', activeId],
    enabled: !!activeId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from('org_positions')
        .select('*')
        .eq('organization_id', activeId)
        .order('sort_order');
      if (error) throw error;
      return (data || []) as OrgPosition[];
    },
  });
}

/** Profiles of everyone in the active organization. */
export function useOrgDirectory() {
  const { activeId } = useActiveOrg();
  return useQuery({
    queryKey: ['org-profiles', activeId],
    enabled: !!activeId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: members, error } = await sb
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', activeId);
      if (error) throw error;
      const ids = (members || []).map((m: any) => m.user_id);
      if (!ids.length) return [] as DirectoryProfile[];
      const { data: profiles, error: pErr } = await sb.rpc('directory_profiles', { p_ids: ids });
      if (pErr) throw pErr;
      return (profiles || []) as DirectoryProfile[];
    },
  });
}

function useInvalidatePositions() {
  const qc = useQueryClient();
  const { activeId } = useActiveOrg();
  return () => qc.invalidateQueries({ queryKey: ['org-positions', activeId] });
}

export function useUpsertPosition() {
  const invalidate = useInvalidatePositions();
  const { activeId } = useActiveOrg();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<OrgPosition> & { title?: string }) => {
      if (!activeId) throw new Error('Nessuna organizzazione attiva');
      if (input.id) {
        const { id, ...rest } = input;
        const { error } = await sb.from('org_positions').update(rest).eq('id', id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await sb
        .from('org_positions')
        .insert({
          organization_id: activeId,
          created_by: user?.id ?? null,
          title: input.title || 'Nuova posizione',
          user_id: input.user_id ?? null,
          team_id: input.team_id ?? null,
          manager_id: input.manager_id ?? null,
          x: input.x ?? 60,
          y: input.y ?? 60,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });
}

export function useDeletePosition() {
  const invalidate = useInvalidatePositions();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from('org_positions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Suppliers flagged as subcontractors in the active org (used by Gantt + calendar). */
export function useSubcontractors() {
  const { activeId } = useActiveOrg();
  return useQuery({
    queryKey: ['subcontractors', activeId],
    enabled: !!activeId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from('suppliers')
        .select('id, name, is_subcontractor, default_team_id')
        .eq('organization_id', activeId)
        .eq('is_subcontractor', true);
      if (error) throw error;
      return (data || []) as { id: string; name: string; is_subcontractor: boolean; default_team_id: string | null }[];
    },
  });
}

/** Position visible to the current user, as computed server-side by org_chart_scope(). */
export interface ScopedPosition extends OrgPosition {
  /** true when the row is only part of the upward command line (read-only, dimmed) */
  is_ancestor: boolean;
  /** true when the current user may edit this position (mirrors can_manage_member) */
  can_edit: boolean;
}

/**
 * Positions visible to the current user (admin => whole org, otherwise own
 * subtree + upward command line). Filtering happens inside the RPC.
 */
export function useOrgChartScope() {
  const { activeId } = useActiveOrg();
  return useQuery({
    queryKey: ['org-chart-scope', activeId],
    enabled: !!activeId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await sb.rpc('org_chart_scope', { p_org: activeId });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as ScopedPosition[];
    },
  });
}

/** Update display_name / avatar_url of a profile (admins, or your own profile). */
export function useUpdateProfileFields() {
  const qc = useQueryClient();
  const { activeId } = useActiveOrg();
  return useMutation({
    mutationFn: async ({ id, display_name, avatar_url }: { id: string; display_name?: string; avatar_url?: string | null }) => {
      const patch: Record<string, unknown> = {};
      if (display_name !== undefined) patch.display_name = display_name;
      if (avatar_url !== undefined) patch.avatar_url = avatar_url;
      if (!Object.keys(patch).length) return;
      const { error } = await sb.from('profiles').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-profiles', activeId] }),
  });
}
