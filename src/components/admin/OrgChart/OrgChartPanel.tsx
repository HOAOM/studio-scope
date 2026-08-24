/**
 * OrgChartPanel — organigramma v3, contenitore unico.
 * Usato sia dentro la scheda Organizzazione (Admin Panel, modificabile)
 * sia come vista in sola lettura per i membri semplici.
 */
import { useMemo, useState } from 'react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, pointerWithin,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  useOrgChartV3, usePositionCatalog, useUpsertOrgNode, useMoveOrgNode,
  useDeleteOrgNode, useSetCostVisibility, useSeedOrgChart, useCreateTeamNode,
  useSetTeamMembership, type OrgNode,
} from '@/hooks/useOrgChartV3';
import { useEffectiveOwner } from '@/hooks/useEffectiveOwner';
import { usePermissions } from '@/hooks/usePermissions';
import type { DirectoryProfile, Team } from '@/hooks/useOrgStructure';
import { OrgTree, type OrgTreeContext } from './OrgTree';
import { UnassignedPanel, CatalogPanel } from './SidePanels';
import { PersonDetailSheet } from './PersonDetailSheet';
import type { Contractor } from './ContractorCard';

export function OrgChartPanel({ readOnly = false }: { readOnly?: boolean }) {
  const { data, tree, unassignedUserIds, isLoading } = useOrgChartV3();
  const { data: catalog = [] } = usePositionCatalog();
  const { isEffectiveOwner, isLoading: ownerLoading } = useEffectiveOwner();
  const { isOrgAdmin, isLoading: permLoading } = usePermissions();
  const upsert = useUpsertOrgNode();
  const move = useMoveOrgNode();
  const remove = useDeleteOrgNode();
  const setCostVisibility = useSetCostVisibility();
  const seed = useSeedOrgChart();
  const createTeam = useCreateTeamNode();
  const setMembership = useSetTeamMembership();

  const [selected, setSelected] = useState<OrgNode | null>(null);
  const [search, setSearch] = useState('');
  const [dragLabel, setDragLabel] = useState<string | null>(null);

  const permissionsReady = !ownerLoading && !permLoading;
  const canEdit = !readOnly && permissionsReady && (isEffectiveOwner || isOrgAdmin);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const ctx: OrgTreeContext = useMemo(() => {
    const profiles = new Map<string, DirectoryProfile>();
    (data?.profiles || []).forEach((p) => profiles.set(p.id, p));
    const teams = new Map<string, Team>();
    (data?.teams || []).forEach((t) => teams.set(t.id, t));
    const suppliers = new Map<string, Contractor>();
    (data?.subcontractors || []).forEach((s: any) => suppliers.set(s.id, s));

    const extraTeams = new Map<string, number>();
    const leadsByTeam = new Map<string, Set<string>>();
    const membersByTeam = new Map<string, string[]>();
    (data?.teamMembers || []).forEach((m) => {
      extraTeams.set(m.user_id, (extraTeams.get(m.user_id) ?? 0) + 1);
      const list = membersByTeam.get(m.team_id) || [];
      list.push(m.user_id);
      membersByTeam.set(m.team_id, list);
      if (m.member_role === 'lead') {
        const set = leadsByTeam.get(m.team_id) || new Set<string>();
        set.add(m.user_id);
        leadsByTeam.set(m.team_id, set);
      }
    });
    extraTeams.forEach((v, k) => extraTeams.set(k, Math.max(0, v - 1)));

    return {
      profiles, teams, suppliers,
      today: data?.todayByUser || new Map(),
      extraTeams, leadsByTeam, membersByTeam, canEdit,
      onOpen: (n) => setSelected(n),
    };
  }, [data, canEdit]);

  const findNode = (id: string | null, nodes: OrgNode[] = tree): OrgNode | undefined => {
    if (!id) return undefined;
    for (const n of nodes) {
      if (n.id === id) return n;
      const hit = findNode(id, n.children);
      if (hit) return hit;
    }
    return undefined;
  };

  const filteredRoots = useMemo(() => {
    if (!search.trim()) return tree;
    const q = search.toLowerCase();
    const matches = (n: OrgNode): boolean => {
      const name = n.user_id ? ctx.profiles.get(n.user_id)?.display_name || '' : '';
      return (
        n.title.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        n.children.some(matches)
      );
    };
    const prune = (n: OrgNode): OrgNode => ({ ...n, children: n.children.filter(matches).map(prune) });
    return tree.filter(matches).map(prune);
  }, [tree, search, ctx.profiles]);

  const unassignedPeople = useMemo(
    () => (data?.profiles || []).filter((p) => unassignedUserIds.includes(p.id)),
    [data?.profiles, unassignedUserIds],
  );

  const unplacedContractors = useMemo(() => {
    const placed = new Set((data?.positions || []).map((p) => p.supplier_id).filter(Boolean) as string[]);
    return ((data?.subcontractors || []) as Contractor[]).filter((s) => !placed.has(s.id));
  }, [data]);

  const handleDragStart = (e: DragStartEvent) => {
    const payload = e.active.data.current as any;
    if (payload?.kind === 'node') {
      const n = findNode(payload.nodeId);
      setDragLabel(
        (n?.user_id ? ctx.profiles.get(n.user_id)?.display_name : undefined) || n?.title || 'Scheda',
      );
    } else if (payload?.kind === 'person') {
      setDragLabel(ctx.profiles.get(payload.userId)?.display_name || 'Persona');
    } else if (payload?.kind === 'supplier') {
      setDragLabel(unplacedContractors.find((s) => s.id === payload.supplierId)?.name || 'Appaltatore');
    } else if (payload?.kind === 'catalog') {
      setDragLabel(payload.title || 'Posizione');
    } else {
      setDragLabel(null);
    }
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setDragLabel(null);
    if (!canEdit) return;
    if (!e.over) {
      toast.info('Rilasciato fuori da un contenitore valido: la scheda è tornata al suo posto.');
      return;
    }
    const target = e.over.data?.current as { nodeId: string | null } | undefined;
    const parentId = target?.nodeId ?? null;
    const parent = findNode(parentId);
    const parentTeamId = parent?.node_kind === 'team' ? parent.team_id : null;
    const payload = e.active.data.current as any;
    try {
      if (payload?.kind === 'node') {
        if (payload.nodeId === parentId) return;
        const moved = findNode(payload.nodeId);
        await move.mutateAsync({
          id: payload.nodeId,
          manager_id: parentId,
          team_id: parentTeamId ?? null,
        });
        if (parentTeamId && moved?.user_id) {
          await setMembership.mutateAsync({ userId: moved.user_id, teamId: parentTeamId });
        }
      } else if (payload?.kind === 'person') {
        await upsert.mutateAsync({
          node_kind: 'person', user_id: payload.userId, manager_id: parentId,
          team_id: parentTeamId, title: 'Da definire',
        });
        if (parentTeamId) {
          await setMembership.mutateAsync({ userId: payload.userId, teamId: parentTeamId });
        }
      } else if (payload?.kind === 'supplier') {
        const sup = unplacedContractors.find((s) => s.id === payload.supplierId);
        await upsert.mutateAsync({
          node_kind: 'contractor', supplier_id: payload.supplierId, manager_id: parentId,
          title: sup?.name || 'Appaltatore',
        });
      } else if (payload?.kind === 'catalog') {
        const isTeam = !!payload.isLead && (payload.level === 'L4' || payload.level === 'L3');
        if (isTeam) {
          await createTeam.mutateAsync({
            name: payload.area || payload.title,
            title: payload.title,
            catalog_id: payload.catalogId,
            manager_id: parentId,
          });
        } else {
          await upsert.mutateAsync({
            node_kind: 'person',
            catalog_id: payload.catalogId, title: payload.title,
            manager_id: parentId, team_id: parentTeamId,
          });
        }
      }
      toast.success('Organigramma aggiornato');
    } catch (err: any) {
      toast.error(err?.message || 'Aggiornamento non riuscito');
    }
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const selectedProfile = selected?.user_id ? (data?.profiles || []).find((p) => p.id === selected.user_id) : undefined;
  const selectedSupplier = selected?.supplier_id
    ? ((data?.subcontractors || []) as Contractor[]).find((s) => s.id === selected.supplier_id)
    : undefined;
  const selectedTeams = selected?.user_id
    ? (data?.teamMembers || [])
        .filter((m) => m.user_id === selected.user_id)
        .map((m) => (data?.teams || []).find((t) => t.id === m.team_id))
        .filter(Boolean) as Team[]
    : [];
  const primaryTeamId = selected?.user_id
    ? (data?.teamMembers || []).find((m) => m.user_id === selected.user_id && (m as any).is_primary)?.team_id ?? null
    : null;

  return (
    <DndContext
      collisionDetection={pointerWithin}

      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragLabel(null)}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca persona o ruolo…"
              className="h-8 pl-7 text-xs"
            />
          </div>
          {canEdit && !tree.length && (
            <Button
              size="sm"
              disabled={seed.isPending}
              onClick={() =>
                seed.mutate(undefined, {
                  onSuccess: (n) =>
                    n > 0
                      ? toast.success('Organigramma di base creato')
                      : toast.info('Organigramma già presente'),
                  onError: (e: any) => toast.error(e?.message || 'Creazione non riuscita'),
                })
              }
            >
              {seed.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Struttura di base
            </Button>
          )}
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                upsert.mutate({ node_kind: 'unit', title: 'Nuova area', manager_id: null })
              }
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />Area / dipartimento
            </Button>
          )}
        </div>

        <div className={canEdit ? 'grid gap-3 lg:grid-cols-[1fr_260px]' : ''}>
          <OrgTree roots={filteredRoots} ctx={ctx} />
          {canEdit && (
            <div className="space-y-3">
              <UnassignedPanel people={unassignedPeople} contractors={unplacedContractors} />
              <CatalogPanel entries={catalog} />
            </div>
          )}
        </div>
      </div>

      <PersonDetailSheet
        node={selected}
        profile={selectedProfile as any}
        supplier={selectedSupplier}
        teams={selectedTeams}
        primaryTeamId={primaryTeamId}
        today={selected?.user_id ? data?.todayByUser.get(selected.user_id) : undefined}
        canEdit={canEdit}
        canManagePermissions={canEdit}
        overrideValue={
          selected?.user_id && data?.overrides.has(selected.user_id)
            ? !!data.overrides.get(selected.user_id)
            : null
        }
        onOverrideChange={(value) => {
          if (!selected?.user_id) return;
          setCostVisibility.mutate(
            { userId: selected.user_id, value },
            {
              onSuccess: () => toast.success('Permesso costi aggiornato'),
              onError: (e: any) => toast.error(e?.message || 'Aggiornamento non riuscito'),
            },
          );
        }}
        onDelete={() => {
          if (!selected) return;
          remove.mutate(selected.id, {
            onSuccess: () => { toast.success('Scheda rimossa'); setSelected(null); },
            onError: (e: any) => toast.error(e?.message || 'Rimozione non riuscita'),
          });
        }}
        onClose={() => setSelected(null)}
      />

      <DragOverlay>
        {dragLabel ? (
          <div className="pointer-events-none rounded-md border border-primary bg-card px-2.5 py-1.5 text-xs font-medium shadow-lg">
            {dragLabel}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
