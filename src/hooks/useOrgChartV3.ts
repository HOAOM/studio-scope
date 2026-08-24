/**
 * useOrgChartV3 — dati unificati per l'organigramma v3 (scatole annidate).
 *
 * Query piatte in parallelo, albero costruito in memoria:
 *  - org_chart_scope()  => quali nodi sono visibili + can_edit / is_ancestor
 *  - org_positions      => campi completi (node_kind, supplier_id, catalog_id)
 *  - teams / team_members / directory_profiles
 *  - calendar_entries   => stato di OGGI, una sola query per tutta l'org
 *  - cost_visibility_overrides => interruttore costi per persona
 */
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveOrg } from '@/hooks/useMyOrganizations';
import { useAuth } from '@/hooks/useAuth';
import type { DirectoryProfile, Team, TeamMember } from '@/hooks/useOrgStructure';

const sb = supabase as any;

export type NodeKind = 'person' | 'team' | 'unit' | 'contractor';
export type TodayStatus = 'working' | 'absent' | 'idle';

export interface OrgPositionV3 {
  id: string;
  organization_id: string;
  title: string;
  user_id: string | null;
  team_id: string | null;
  manager_id: string | null;
  supplier_id: string | null;
  catalog_id: string | null;
  node_kind: NodeKind;
  base_role: string | null;
  sort_order: number;
  notes: string | null;
  can_edit: boolean;
  is_ancestor: boolean;
}

export interface CatalogEntry {
  id: string;
  level: 'L1_L2' | 'L3' | 'L4';
  area: string;
  title: string;
  parent_title: string | null;
  is_lead: boolean;
  min_size: 'small' | 'medium' | 'large';
  sort_order: number;
}

export interface TodayEntry {
  status: TodayStatus;
  label: string | null;
}

export interface OrgNode extends OrgPositionV3 {
  children: OrgNode[];
  depth: number;
}

const ABSENT_TYPES = new Set(['leave', 'permit', 'sick', 'holiday']);

export function usePositionCatalog() {
  return useQuery({
    queryKey: ['position-catalog'],
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from('position_catalog')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return (data || []) as CatalogEntry[];
    },
  });
}

/** Tutti i dati dell'organigramma per l'org attiva. */
export function useOrgChartV3() {
  const { activeId } = useActiveOrg();
  const today = new Date().toISOString().slice(0, 10);

  const query = useQuery({
    queryKey: ['org-chart-v3', activeId, today],
    enabled: !!activeId,
    staleTime: 60_000,
    queryFn: async () => {
      const [scopeRes, posRes, teamsRes, tmRes, memRes, calRes, cvoRes, supRes] = await Promise.all([
        sb.rpc('org_chart_scope', { p_org: activeId }),
        sb.from('org_positions').select('*').eq('organization_id', activeId),
        sb.from('teams').select('*').eq('organization_id', activeId).order('name'),
        sb.from('team_members').select('*').eq('organization_id', activeId),
        sb.from('organization_members').select('user_id').eq('organization_id', activeId),
        sb
          .from('calendar_entries')
          .select('user_id, entry_type, status, title, project_id, start_date, end_date')
          .eq('organization_id', activeId)
          .lte('start_date', today)
          .gte('end_date', today),
        sb.from('cost_visibility_overrides').select('user_id, can_see_costs').eq('organization_id', activeId),
        sb
          .from('suppliers')
          .select('id, name, categories, contact_person, email, phone, is_subcontractor')
          .eq('organization_id', activeId)
          .eq('is_subcontractor', true),
      ]);

      for (const r of [scopeRes, posRes, teamsRes, tmRes, memRes, calRes, cvoRes, supRes]) {
        if (r.error) throw r.error;
      }

      const scope = new Map<string, { can_edit: boolean; is_ancestor: boolean }>(
        (scopeRes.data || []).map((s: any) => [s.id, { can_edit: !!s.can_edit, is_ancestor: !!s.is_ancestor }]),
      );

      const positions: OrgPositionV3[] = (posRes.data || [])
        .filter((p: any) => scope.has(p.id))
        .map((p: any) => ({
          ...p,
          node_kind: (p.node_kind || 'person') as NodeKind,
          can_edit: scope.get(p.id)!.can_edit,
          is_ancestor: scope.get(p.id)!.is_ancestor,
        }));

      const ids = (memRes.data || []).map((m: any) => m.user_id);
      let profiles: DirectoryProfile[] = [];
      if (ids.length) {
        const { data, error } = await sb.rpc('directory_profiles', { p_ids: ids });
        if (error) throw error;
        profiles = (data || []) as DirectoryProfile[];
      }

      const todayByUser = new Map<string, TodayEntry>();
      for (const e of calRes.data || []) {
        if (!e.user_id || e.status === 'rejected' || e.status === 'cancelled') continue;
        const absent = ABSENT_TYPES.has(e.entry_type);
        const current = todayByUser.get(e.user_id);
        if (absent) {
          todayByUser.set(e.user_id, { status: 'absent', label: e.title || null });
        } else if (!current || current.status !== 'absent') {
          todayByUser.set(e.user_id, { status: 'working', label: e.title || null });
        }
      }

      return {
        positions,
        teams: (teamsRes.data || []) as Team[],
        teamMembers: (tmRes.data || []) as (TeamMember & { is_primary: boolean })[],
        profiles,
        todayByUser,
        overrides: new Map<string, boolean>(
          (cvoRes.data || []).map((o: any) => [o.user_id, !!o.can_see_costs]),
        ),
        subcontractors: (supRes.data || []) as any[],
        memberIds: ids as string[],
      };
    },
  });

  const tree = useMemo(() => buildTree(query.data?.positions || []), [query.data?.positions]);

  const unassignedUserIds = useMemo(() => {
    if (!query.data) return [] as string[];
    const placed = new Set(
      query.data.positions.filter((p) => p.user_id).map((p) => p.user_id as string),
    );
    const inTeam = new Set(query.data.teamMembers.map((m) => m.user_id));
    return query.data.memberIds.filter((id) => !placed.has(id) && !inTeam.has(id));
  }, [query.data]);

  return { ...query, tree, unassignedUserIds };
}

/** Costruisce l'albero dalle righe piatte. La profondità emerge dai dati. */
export function buildTree(rows: OrgPositionV3[]): OrgNode[] {
  const byId = new Map<string, OrgNode>();
  rows.forEach((r) => byId.set(r.id, { ...r, children: [], depth: 0 }));
  const roots: OrgNode[] = [];
  byId.forEach((node) => {
    const parent = node.manager_id ? byId.get(node.manager_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  const sortRec = (nodes: OrgNode[], depth: number) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
    nodes.forEach((n) => {
      n.depth = depth;
      sortRec(n.children, depth + 1);
    });
  };
  sortRec(roots, 0);
  return roots;
}

function useInvalidateChart() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['org-chart-v3'] });
    qc.invalidateQueries({ queryKey: ['org-positions'] });
  };
}

/** Crea l'organigramma di base (CEO + 3 aree) se l'org non ne ha ancora uno. */
export function useSeedOrgChart() {
  const invalidate = useInvalidateChart();
  const { activeId } = useActiveOrg();
  return useMutation({
    mutationFn: async () => {
      if (!activeId) throw new Error('Nessuna organizzazione attiva');
      const { data, error } = await sb.rpc('seed_org_chart_for_org', { p_org: activeId });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: invalidate,
  });
}

export interface UpsertNodeInput {
  id?: string;
  title?: string;
  node_kind?: NodeKind;
  user_id?: string | null;
  team_id?: string | null;
  manager_id?: string | null;
  supplier_id?: string | null;
  catalog_id?: string | null;
  sort_order?: number;
  notes?: string | null;
}

export function useUpsertOrgNode() {
  const invalidate = useInvalidateChart();
  const { activeId } = useActiveOrg();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: UpsertNodeInput) => {
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
          node_kind: input.node_kind ?? 'person',
          user_id: input.user_id ?? null,
          team_id: input.team_id ?? null,
          manager_id: input.manager_id ?? null,
          supplier_id: input.supplier_id ?? null,
          catalog_id: input.catalog_id ?? null,
          x: 0,
          y: 0,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteOrgNode() {
  const invalidate = useInvalidateChart();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from('org_positions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Sposta un nodo sotto un nuovo parent (drag & drop): scrive relazioni, mai coordinate. */
export function useMoveOrgNode() {
  const invalidate = useInvalidateChart();
  return useMutation({
    mutationFn: async ({ id, manager_id, team_id }: { id: string; manager_id: string | null; team_id?: string | null }) => {
      const patch: Record<string, unknown> = { manager_id };
      if (team_id !== undefined) patch.team_id = team_id;
      const { error } = await sb.from('org_positions').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Appartenenza a una squadra (multi-squadra + squadra primaria). */
export function useSetTeamMembership() {
  const invalidate = useInvalidateChart();
  const { activeId } = useActiveOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId, teamId, isPrimary, remove,
    }: { userId: string; teamId: string; isPrimary?: boolean; remove?: boolean }) => {
      if (!activeId) throw new Error('Nessuna organizzazione attiva');
      if (remove) {
        const { error } = await sb
          .from('team_members')
          .delete()
          .eq('organization_id', activeId)
          .eq('user_id', userId)
          .eq('team_id', teamId);
        if (error) throw error;
        return;
      }
      if (isPrimary) {
        const { error: clearErr } = await sb
          .from('team_members')
          .update({ is_primary: false })
          .eq('organization_id', activeId)
          .eq('user_id', userId);
        if (clearErr) throw clearErr;
      }
      const { data: existing, error: selErr } = await sb
        .from('team_members')
        .select('id')
        .eq('organization_id', activeId)
        .eq('user_id', userId)
        .eq('team_id', teamId)
        .maybeSingle();
      if (selErr) throw selErr;
      if (existing?.id) {
        const { error } = await sb
          .from('team_members')
          .update({ is_primary: !!isPrimary })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from('team_members').insert({
          organization_id: activeId,
          team_id: teamId,
          user_id: userId,
          member_role: 'member',
          is_primary: !!isPrimary,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['team-members'] });
    },
  });
}

/** Interruttore individuale "può vedere costi, prezzi e margini". */
export function useSetCostVisibility() {
  const invalidate = useInvalidateChart();
  const { activeId } = useActiveOrg();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ userId, value }: { userId: string; value: boolean | null }) => {
      if (!activeId) throw new Error('Nessuna organizzazione attiva');
      if (value === null) {
        const { error } = await sb
          .from('cost_visibility_overrides')
          .delete()
          .eq('organization_id', activeId)
          .eq('user_id', userId);
        if (error) throw error;
        return;
      }
      const { error } = await sb
        .from('cost_visibility_overrides')
        .upsert(
          { organization_id: activeId, user_id: userId, can_see_costs: value, set_by: user?.id ?? null },
          { onConflict: 'organization_id,user_id' },
        );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
