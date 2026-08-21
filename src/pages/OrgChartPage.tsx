/**
 * OrgChartPage — full-page organigram (React Flow).
 *
 * Visibility is decided server-side by public.org_chart_scope():
 *  - admin / owner  => whole organization
 *  - manager / lead => own subtree (recursive) + upward command line
 *  - employee       => self + upward command line
 * Rows flagged is_ancestor render dimmed / dashed and are never editable.
 *
 * Editing: org_positions fields require can_edit (mirrors can_manage_member),
 * profile fields (name, avatar) require org admin or own profile.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeChange,
  type Connection,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { ArrowLeft, ChevronDown, ChevronRight, LayoutGrid, Loader2, Lock, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import {
  useOrgChartScope, useTeams, useTeamMembers, useOrgDirectory,
  useUpsertPosition, useDeletePosition, useUpdateProfileFields,
  type ScopedPosition, type DirectoryProfile, type Team,
} from '@/hooks/useOrgStructure';
import { roleLabel, ORG_ROLES } from '@/lib/roles';

const NODE_W = 220;
const H_GAP = 40;
const V_GAP = 130;

interface NodeData {
  title: string;
  profile?: DirectoryProfile;
  teams: Team[];
  reportsCount: number;
  hiddenCount: number;
  baseRole: string | null;
  editable: boolean;
  isAncestor: boolean;
  isSelf: boolean;
  dimmed: boolean;
  collapsed: boolean;
  onToggle: () => void;
}

function PersonNode({ data, selected }: NodeProps<NodeData>) {
  const name = data.profile?.display_name || data.profile?.email?.split('@')[0] || 'Non assegnato';
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div
      className={cn(
        'rounded-lg border bg-card px-3 py-2 shadow-sm transition-all',
        data.isAncestor ? 'border-dashed border-muted-foreground/40 bg-muted/30' : 'border-border',
        data.reportsCount > 0 && !data.isAncestor && 'border-primary/70 ring-1 ring-primary/25',
        data.isSelf && 'ring-2 ring-primary',
        selected && 'ring-2 ring-primary/80',
        data.dimmed && 'opacity-30',
      )}
      style={{ width: NODE_W }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground/60" />
      <div className="flex items-center gap-2">
        <Avatar className="h-8 w-8">
          {data.profile?.avatar_url ? <AvatarImage src={data.profile.avatar_url} alt={name} /> : null}
          <AvatarFallback className="text-[10px] bg-muted font-semibold">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate text-foreground">
            {name}{data.isSelf && ' ★'}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">{data.title}</p>
        </div>
        {!data.editable && <Lock className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />}
      </div>

      {!data.isAncestor && (data.teams.length > 0 || data.baseRole) && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {data.baseRole && (
            <span className="text-[8px] px-1 py-px rounded border border-border text-muted-foreground">
              {roleLabel(data.baseRole)}
            </span>
          )}
          {data.teams.map(t => (
            <span
              key={t.id}
              className="text-[8px] px-1 py-px rounded border font-medium"
              style={{
                borderColor: t.color || 'hsl(var(--border))',
                color: t.color || 'hsl(var(--muted-foreground))',
                background: t.color ? `${t.color}1a` : 'transparent',
              }}
            >
              {t.code || t.name}
            </span>
          ))}
        </div>
      )}

      {data.reportsCount > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); data.onToggle(); }}
          className="mt-1.5 w-full flex items-center justify-center gap-1 text-[9px] text-muted-foreground hover:text-foreground"
        >
          {data.collapsed
            ? <><ChevronRight className="w-3 h-3" />{data.hiddenCount} riporti nascosti</>
            : <><ChevronDown className="w-3 h-3" />{data.reportsCount} riporti diretti</>}
        </button>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-primary/70" />
    </div>
  );
}

const nodeTypes = { person: PersonNode };

/** Tidy top-down tree layout: leaves packed left→right, parents centered. */
function autoLayout(positions: ScopedPosition[]) {
  const childrenOf = new Map<string | null, ScopedPosition[]>();
  positions.forEach(p => {
    const key = p.manager_id && positions.some(q => q.id === p.manager_id) ? p.manager_id : null;
    const arr = childrenOf.get(key) || [];
    arr.push(p);
    childrenOf.set(key, arr);
  });
  const coords: Record<string, { x: number; y: number }> = {};
  let cursor = 0;
  const walk = (node: ScopedPosition, depth: number): number => {
    const kids = (childrenOf.get(node.id) || []).sort((a, b) => a.title.localeCompare(b.title));
    let x: number;
    if (!kids.length) {
      x = cursor;
      cursor += NODE_W + H_GAP;
    } else {
      const xs = kids.map(k => walk(k, depth + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    coords[node.id] = { x, y: depth * V_GAP };
    return x;
  };
  (childrenOf.get(null) || []).sort((a, b) => a.title.localeCompare(b.title)).forEach(r => walk(r, 0));
  return coords;
}

function OrgChartInner() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOrgAdmin } = usePermissions();
  const { data: positions = [], isLoading } = useOrgChartScope();
  const { data: teams = [] } = useTeams();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: directory = [] } = useOrgDirectory();
  const upsert = useUpsertPosition();
  const del = useDeletePosition();
  const updateProfile = useUpdateProfileFields();
  const { fitView, setCenter } = useReactFlow();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragPos, setDragPos] = useState<Record<string, { x: number; y: number }>>({});

  const profileById = useMemo(() => new Map(directory.map(p => [p.id, p])), [directory]);
  const teamById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams]);

  const teamsForUser = useCallback((userId: string | null) => {
    if (!userId) return [] as Team[];
    return teamMembers
      .filter(tm => tm.user_id === userId)
      .map(tm => teamById.get(tm.team_id))
      .filter(Boolean) as Team[];
  }, [teamMembers, teamById]);

  const childrenOf = useMemo(() => {
    const m = new Map<string, ScopedPosition[]>();
    positions.forEach(p => {
      if (!p.manager_id) return;
      const arr = m.get(p.manager_id) || [];
      arr.push(p);
      m.set(p.manager_id, arr);
    });
    return m;
  }, [positions]);

  /** ids hidden because an ancestor node is collapsed */
  const hiddenIds = useMemo(() => {
    const hidden = new Set<string>();
    const hide = (id: string) => {
      (childrenOf.get(id) || []).forEach(c => {
        if (hidden.has(c.id)) return;
        hidden.add(c.id);
        hide(c.id);
      });
    };
    collapsed.forEach(id => hide(id));
    return hidden;
  }, [collapsed, childrenOf]);

  const subtreeSize = useCallback((id: string): number => {
    const kids = childrenOf.get(id) || [];
    return kids.reduce((n, k) => n + 1 + subtreeSize(k.id), 0);
  }, [childrenOf]);

  const matchesFilters = useCallback((p: ScopedPosition) => {
    const prof = p.user_id ? profileById.get(p.user_id) : undefined;
    const label = `${prof?.display_name || ''} ${prof?.email || ''} ${p.title}`.toLowerCase();
    const okSearch = !search.trim() || label.includes(search.trim().toLowerCase());
    const okTeam = teamFilter === 'all'
      || p.team_id === teamFilter
      || teamsForUser(p.user_id).some(t => t.id === teamFilter);
    return okSearch && okTeam;
  }, [search, teamFilter, profileById, teamsForUser]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const nodes: Node<NodeData>[] = useMemo(() => positions
    .filter(p => !hiddenIds.has(p.id))
    .map(p => {
      const pos = dragPos[p.id] || { x: Number(p.x) || 0, y: Number(p.y) || 0 };
      const explicitTeam = p.team_id ? teamById.get(p.team_id) : undefined;
      const userTeams = teamsForUser(p.user_id);
      const allTeams = explicitTeam && !userTeams.some(t => t.id === explicitTeam.id)
        ? [explicitTeam, ...userTeams]
        : userTeams;
      const kids = childrenOf.get(p.id) || [];
      return {
        id: p.id,
        type: 'person',
        position: pos,
        draggable: p.can_edit,
        data: {
          title: p.title,
          profile: p.user_id ? profileById.get(p.user_id) : undefined,
          teams: allTeams,
          reportsCount: kids.length,
          hiddenCount: subtreeSize(p.id),
          baseRole: p.base_role,
          editable: p.can_edit,
          isAncestor: p.is_ancestor,
          isSelf: !!p.user_id && p.user_id === user?.id,
          dimmed: !matchesFilters(p),
          collapsed: collapsed.has(p.id),
          onToggle: () => toggleCollapse(p.id),
        },
      };
    }), [positions, hiddenIds, dragPos, teamById, teamsForUser, childrenOf, subtreeSize,
        profileById, user?.id, matchesFilters, collapsed, toggleCollapse]);

  const edges: Edge[] = useMemo(() => positions
    .filter(p => p.manager_id && !hiddenIds.has(p.id) && !hiddenIds.has(p.manager_id))
    .map(p => ({
      id: `${p.manager_id}-${p.id}`,
      source: p.manager_id as string,
      target: p.id,
      type: 'smoothstep',
      style: {
        stroke: p.is_ancestor ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary))',
        strokeWidth: 1.5,
        strokeDasharray: p.is_ancestor ? '4 4' : undefined,
      },
    })), [positions, hiddenIds]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const next = applyNodeChanges(changes, nodes);
    setDragPos(prev => {
      const copy = { ...prev };
      next.forEach(n => { copy[n.id] = n.position; });
      return copy;
    });
  }, [nodes]);

  const onNodeDragStop = useCallback(async (_e: unknown, node: Node) => {
    const p = positions.find(x => x.id === node.id);
    if (!p || !p.can_edit) return;
    try {
      await upsert.mutateAsync({ id: node.id, x: Math.round(node.position.x), y: Math.round(node.position.y) });
    } catch (err: any) {
      toast.error(err.message || 'Impossibile salvare la posizione');
    }
  }, [positions, upsert]);

  const onConnect = useCallback(async (conn: Connection) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return;
    const target = positions.find(p => p.id === conn.target);
    if (!target?.can_edit) { toast.error('Non hai i permessi per modificare questa posizione'); return; }
    try {
      await upsert.mutateAsync({ id: target.id, manager_id: conn.source });
      toast.success('Riporto aggiornato');
    } catch (err: any) {
      toast.error(err.message || 'Aggiornamento non riuscito');
    }
  }, [positions, upsert]);

  const onEdgesDelete = useCallback(async (deleted: Edge[]) => {
    for (const e of deleted) {
      const target = positions.find(p => p.id === e.target);
      if (!target?.can_edit) continue;
      try { await upsert.mutateAsync({ id: target.id, manager_id: null }); } catch { /* noop */ }
    }
  }, [positions, upsert]);

  /** persist a tidy tree layout */
  const runAutoLayout = useCallback(async () => {
    const coords = autoLayout(positions);
    setDragPos(coords);
    const editable = positions.filter(p => p.can_edit && coords[p.id]);
    try {
      await Promise.all(editable.map(p => upsert.mutateAsync({
        id: p.id, x: Math.round(coords[p.id].x), y: Math.round(coords[p.id].y),
      })));
      toast.success('Layout riordinato');
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);
    } catch (e: any) {
      toast.error(e.message || 'Layout non salvato per tutte le posizioni');
    }
  }, [positions, upsert, fitView]);

  /** center on first search match */
  useEffect(() => {
    if (!search.trim()) return;
    const hit = positions.find(p => matchesFilters(p) && !hiddenIds.has(p.id));
    if (hit) {
      const pos = dragPos[hit.id] || { x: Number(hit.x) || 0, y: Number(hit.y) || 0 };
      setCenter(pos.x + NODE_W / 2, pos.y + 40, { zoom: 1, duration: 300 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const selected = positions.find(p => p.id === selectedId) || null;

  const handleCreate = async () => {
    try {
      const id = await upsert.mutateAsync({ title: 'Nuova posizione', x: 80, y: 80 });
      setSelectedId(id as string);
      toast.success('Posizione creata');
    } catch (e: any) { toast.error(e.message || 'Creazione non riuscita'); }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* toolbar */}
      <div className="h-14 border-b border-border flex items-center gap-2 px-4 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Dashboard
        </Button>
        <div className="flex items-center gap-2 mr-2">
          <Users className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-semibold text-foreground">Organigramma</h1>
        </div>
        <div className="relative w-56">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca persona…"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Squadra" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le squadre</SelectItem>
            {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={runAutoLayout} disabled={!positions.some(p => p.can_edit)}>
          <LayoutGrid className="w-4 h-4 mr-1" /> Auto-layout
        </Button>
        {isOrgAdmin && (
          <Button size="sm" onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-1" /> Posizione
          </Button>
        )}
      </div>

      {/* canvas + side panel */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 relative">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : positions.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              Nessuna posizione visibile. {isOrgAdmin ? 'Crea la prima posizione dalla toolbar.' : ''}
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={(_e, n) => setSelectedId(n.id)}
              onConnect={onConnect}
              onEdgesDelete={onEdgesDelete}
              nodesConnectable={positions.some(p => p.can_edit)}
              elementsSelectable
              fitView
              minZoom={0.2}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={18} color="hsl(var(--border))" />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable className="!bg-card" />
            </ReactFlow>
          )}
        </div>

        {selected && (
          <PositionSidePanel
            key={selected.id}
            position={selected}
            teams={teams}
            directory={directory}
            positions={positions}
            reports={(childrenOf.get(selected.id) || []).length}
            isOrgAdmin={isOrgAdmin}
            currentUserId={user?.id}
            onClose={() => setSelectedId(null)}
            onSavePosition={async (patch) => {
              try {
                await upsert.mutateAsync(patch);
                toast.success('Posizione aggiornata');
              } catch (e: any) { toast.error(e.message || 'Salvataggio non riuscito'); }
            }}
            onSaveProfile={async (id, display_name) => {
              try {
                await updateProfile.mutateAsync({ id, display_name });
              } catch (e: any) { toast.error(e.message || 'Profilo non aggiornato'); }
            }}
            onDelete={isOrgAdmin ? async (id) => {
              try {
                await del.mutateAsync(id);
                toast.success('Posizione eliminata');
                setSelectedId(null);
              } catch (e: any) { toast.error(e.message || 'Eliminazione non riuscita'); }
            } : undefined}
          />
        )}
      </div>
    </div>
  );
}

function PositionSidePanel({
  position, teams, directory, positions, reports, isOrgAdmin, currentUserId,
  onClose, onSavePosition, onSaveProfile, onDelete,
}: {
  position: ScopedPosition;
  teams: Team[];
  directory: DirectoryProfile[];
  positions: ScopedPosition[];
  reports: number;
  isOrgAdmin: boolean;
  currentUserId?: string;
  onClose: () => void;
  onSavePosition: (patch: Partial<ScopedPosition> & { id: string }) => Promise<void>;
  onSaveProfile: (id: string, display_name: string) => Promise<void>;
  onDelete?: (id: string) => void;
}) {
  const profile = position.user_id ? directory.find(p => p.id === position.user_id) : undefined;
  const editable = position.can_edit && !position.is_ancestor;
  const canEditProfile = !!position.user_id && (isOrgAdmin || position.user_id === currentUserId);

  const [title, setTitle] = useState(position.title);
  const [userId, setUserId] = useState(position.user_id || 'none');
  const [teamId, setTeamId] = useState(position.team_id || 'none');
  const [managerId, setManagerId] = useState(position.manager_id || 'none');
  const [baseRole, setBaseRole] = useState(position.base_role || 'none');
  const [notes, setNotes] = useState(position.notes || '');
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const name = profile?.display_name || profile?.email?.split('@')[0] || 'Non assegnato';

  const save = async () => {
    setSaving(true);
    try {
      if (editable) {
        await onSavePosition({
          id: position.id,
          title: title.trim() || 'Posizione',
          user_id: userId === 'none' ? null : userId,
          team_id: teamId === 'none' ? null : teamId,
          manager_id: managerId === 'none' ? null : managerId,
          base_role: (baseRole === 'none' ? null : baseRole) as any,
          notes: notes.trim() || null,
        });
      }
      if (canEditProfile && position.user_id && displayName.trim() !== (profile?.display_name || '')) {
        await onSaveProfile(position.user_id, displayName.trim());
      }
    } finally { setSaving(false); }
  };

  return (
    <aside className="w-[380px] flex-shrink-0 border-l border-border bg-card overflow-y-auto">
      <div className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="h-10 w-10">
              {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt={name} /> : null}
              <AvatarFallback className="text-xs bg-muted font-semibold">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{profile?.email || '—'}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {!editable && (
          <p className="text-[11px] rounded border border-border bg-muted/40 p-2 text-muted-foreground">
            {position.is_ancestor
              ? 'Posizione della tua linea gerarchica: visibile in sola lettura.'
              : 'Non hai i permessi per modificare questa posizione.'}
          </p>
        )}

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome visualizzato</Label>
            <Input
              className="mt-1 h-8 text-xs"
              value={displayName}
              disabled={!canEditProfile}
              onChange={e => setDisplayName(e.target.value)}
            />
            {!canEditProfile && position.user_id && (
              <p className="text-[10px] text-muted-foreground mt-1">Modificabile dalla persona stessa o da un admin.</p>
            )}
          </div>

          <div>
            <Label className="text-xs">Titolo</Label>
            <Input className="mt-1 h-8 text-xs" value={title} disabled={!editable}
              onChange={e => setTitle(e.target.value)} />
          </div>

          <div>
            <Label className="text-xs">Persona</Label>
            <Select value={userId} onValueChange={setUserId} disabled={!editable}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Non assegnata</SelectItem>
                {directory.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.display_name || p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Squadra</Label>
            <Select value={teamId} onValueChange={setTeamId} disabled={!editable}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuna</SelectItem>
                {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Manager</Label>
            <Select value={managerId} onValueChange={setManagerId} disabled={!editable}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuno (vertice)</SelectItem>
                {positions.filter(p => p.id !== position.id).map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Ruolo di riferimento</Label>
            <Select value={baseRole} onValueChange={setBaseRole} disabled={!editable}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuno</SelectItem>
                {ORG_ROLES.map(r => <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Note</Label>
            <Textarea rows={3} className="mt-1 text-xs" value={notes} disabled={!editable}
              onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground border-t border-border pt-3">
          Riporti diretti: <span className="text-foreground font-medium">{reports}</span>
        </div>

        {(editable || canEditProfile) && (
          <div className="flex items-center gap-2 pt-1">
            {onDelete && (
              <Button variant="destructive" size="sm" onClick={() => onDelete(position.id)}>
                <Trash2 className="w-4 h-4 mr-1" /> Elimina
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={onClose}>Chiudi</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Salva
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}

export default function OrgChartPage() {
  return (
    <ReactFlowProvider>
      <OrgChartInner />
    </ReactFlowProvider>
  );
}
