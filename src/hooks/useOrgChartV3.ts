/**
 * useOrgChartV3 — dati unificati per l'organigramma v3 (scatole annidate).
 *
 * Query piatte in parallelo, albero costruito in memoria:
 *  - org_chart_scope()  => quali nodi sono visibili + can_edit / is_ancestor
 *  - org_positions      => campi completi (node_kind, supplier_id, catalog_id)
 *  - teams / team_members / directory_profiles
 *  - calendar_entries   => stato di OGGI, una sola query per tutta l'org
 *  - permission_overrides => interruttori permessi granulari per persona
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
  default_app_role: string | null;
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
      const [scopeRes, posRes, teamsRes, tmRes, memRes, calRes, cvoRes, supRes, catRes, ovrRes, rolesRes] =
        await Promise.all([
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
        sb.from('permission_overrides').select('user_id, capability, value').eq('organization_id', activeId),
        sb
          .from('suppliers')
          .select('id, name, categories, contact_person, email, phone, is_subcontractor')
          .eq('organization_id', activeId)
          .eq('is_subcontractor', true),
        sb.from('position_catalog').select('id, title, area, default_app_role'),
        sb.from('org_position_overrides').select('catalog_id, app_role').eq('organization_id', activeId),
        sb.from('user_roles').select('user_id, role').eq('organization_id', activeId),
      ]);

      for (const r of [scopeRes, posRes, teamsRes, tmRes, memRes, calRes, cvoRes, supRes, catRes, ovrRes, rolesRes]) {
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

      const catalogDefaults = new Map<string, { title: string; role: string | null }>();
      for (const c of catRes.data || []) {
        catalogDefaults.set(c.id, { title: c.title, role: c.default_app_role ?? null });
      }
      const positionOverrides = new Map<string, string | null>();
      for (const o of ovrRes.data || []) positionOverrides.set(o.catalog_id, o.app_role ?? null);

      const rolesByUser = new Map<string, string[]>();
      for (const r of rolesRes.data || []) {
        const list = rolesByUser.get(r.user_id) || [];
        list.push(r.role);
        rolesByUser.set(r.user_id, list);
      }

      return {
        positions,
        teams: (teamsRes.data || []) as Team[],
        teamMembers: (tmRes.data || []) as (TeamMember & { is_primary: boolean })[],
        profiles,
        todayByUser,
        permissions: buildPermissionMap(cvoRes.data || []),
        subcontractors: (supRes.data || []) as any[],
        memberIds: ids as string[],
        catalogDefaults,
        positionOverrides,
        rolesByUser,
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

  /** Stato "ruolo e accesso" per ogni posizione persona. */
  const roleInfo = useMemo(() => {
    const map = new Map<string, NodeRoleInfo>();
    const d = query.data;
    if (!d) return map;
    for (const p of d.positions) {
      if (p.node_kind !== 'person') continue;
      map.set(p.id, resolveNodeRole(p, d.catalogDefaults, d.positionOverrides, d.rolesByUser));
    }
    return map;
  }, [query.data]);

  const roleSummary = useMemo(() => {
    let toDefine = 0, overrides = 0, vacant = 0, noAccess = 0;
    roleInfo.forEach((i) => {
      if (i.status === 'vacant') vacant++;
      else if (i.status === 'undefined') toDefine++;
      else if (i.status === 'no_access') noAccess++;
      if (i.isOverride) overrides++;
    });
    return { toDefine, overrides, vacant, noAccess };
  }, [roleInfo]);

  return { ...query, tree, unassignedUserIds, roleInfo, roleSummary };
}

export type RoleStatus = 'mapped' | 'undefined' | 'no_access' | 'vacant';

export interface NodeRoleInfo {
  /** ruolo suggerito dalla posizione (override studio > default catalogo) */
  expectedRole: string | null;
  /** ruoli funzionali realmente assegnati alla persona */
  actualRoles: string[];
  isOverride: boolean;
  status: RoleStatus;
  /** la posizione suggerisce un ruolo che la persona non ha */
  mismatch: boolean;
}

export function resolveNodeRole(
  p: Pick<OrgPositionV3, 'user_id' | 'catalog_id' | 'base_role'>,
  catalogDefaults: Map<string, { title: string; role: string | null }>,
  positionOverrides: Map<string, string | null>,
  rolesByUser: Map<string, string[]>,
): NodeRoleInfo {
  const isOverride = !!p.catalog_id && positionOverrides.has(p.catalog_id);
  const expectedRole =
    (p.catalog_id && isOverride ? positionOverrides.get(p.catalog_id) : undefined) ??
    (p.catalog_id ? catalogDefaults.get(p.catalog_id)?.role ?? null : null) ??
    p.base_role ??
    null;
  const actualRoles = p.user_id ? rolesByUser.get(p.user_id) || [] : [];

  let status: RoleStatus;
  if (!p.user_id) status = 'vacant';
  else if (!p.catalog_id && !expectedRole && !actualRoles.length) status = 'undefined';
  else if (!expectedRole && !actualRoles.length) status = 'no_access';
  else status = 'mapped';

  return {
    expectedRole,
    actualRoles,
    isOverride,
    status,
    mismatch: !!p.user_id && !!expectedRole && !actualRoles.includes(expectedRole),
  };
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

const TEAM_COLORS = ['#6366f1', '#0ea5e9', '#f59e0b', '#22c55e', '#a855f7', '#ef4444', '#14b8a6', '#64748b'];

/**
 * Crea (o riusa) una vera riga `teams` e la collega a un nodo `team` dell'organigramma.
 * Il nodo visivo non esiste mai senza la squadra corrispondente.
 */
export function useCreateTeamNode() {
  const invalidate = useInvalidateChart();
  const { activeId } = useActiveOrg();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      name, manager_id, catalog_id, title,
    }: { name: string; manager_id: string | null; catalog_id?: string | null; title?: string }) => {
      if (!activeId) throw new Error('Nessuna organizzazione attiva');
      const { data: existing, error: selErr } = await sb
        .from('teams')
        .select('id, name, color')
        .eq('organization_id', activeId)
        .ilike('name', name)
        .maybeSingle();
      if (selErr) throw selErr;

      let teamId = existing?.id as string | undefined;
      if (!teamId) {
        const { count } = await sb
          .from('teams')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', activeId);
        const { data: created, error: insErr } = await sb
          .from('teams')
          .insert({
            organization_id: activeId,
            name,
            color: TEAM_COLORS[(count ?? 0) % TEAM_COLORS.length],
            is_active: true,
            created_by: user?.id ?? null,
          })
          .select('id')
          .single();
        if (insErr) throw insErr;
        teamId = created.id as string;
      }

      const { data: node, error: nodeErr } = await sb
        .from('org_positions')
        .insert({
          organization_id: activeId,
          created_by: user?.id ?? null,
          title: title || name,
          node_kind: 'team',
          team_id: teamId,
          catalog_id: catalog_id ?? null,
          manager_id: manager_id ?? null,
          x: 0,
          y: 0,
        })
        .select('id')
        .single();
      if (nodeErr) throw nodeErr;
      return { nodeId: node.id as string, teamId: teamId! };
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

/**
 * Permessi granulari per persona (tabella permission_overrides).
 * `null` = nessun override, vale il ruolo assegnato.
 */
export const CAPABILITIES = [
  'can_see_costs',
  'can_see_prices',
  'can_see_margins',
  'can_edit_items',
  'can_approve_gates',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type PermissionMap = Map<string, Partial<Record<Capability, boolean>>>;

export function buildPermissionMap(rows: any[]): PermissionMap {
  const map: PermissionMap = new Map();
  for (const r of rows) {
    const entry = map.get(r.user_id) || {};
    entry[r.capability as Capability] = !!r.value;
    map.set(r.user_id, entry);
  }
  return map;
}

export function useSetPermission() {
  const invalidate = useInvalidateChart();
  const { activeId } = useActiveOrg();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      userId, capability, value,
    }: { userId: string; capability: Capability; value: boolean | null }) => {
      if (!activeId) throw new Error('Nessuna organizzazione attiva');
      if (value === null) {
        const { error } = await sb
          .from('permission_overrides')
          .delete()
          .eq('organization_id', activeId)
          .eq('user_id', userId)
          .eq('capability', capability);
        if (error) throw error;
        return;
      }
      const { error } = await sb.from('permission_overrides').upsert(
        {
          organization_id: activeId,
          user_id: userId,
          capability,
          value,
          set_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,user_id,capability' },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

