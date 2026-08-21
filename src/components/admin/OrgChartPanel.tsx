/**
 * OrgChartPanel — visual organigram (React Flow).
 * Nodes = org_positions (person + title + team badges).
 * Edges = manager_id relations. Drag to reposition (x/y), connect to re-parent.
 * Read-only unless the current user can manage the target member.
 */
import { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type Connection,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Trash2, Users, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import {
  useOrgPositions, useTeams, useTeamMembers, useOrgDirectory,
  useUpsertPosition, useDeletePosition,
  type OrgPosition, type DirectoryProfile, type Team,
} from '@/hooks/useOrgStructure';
import { roleLabel, ORG_ROLES } from '@/lib/roles';

interface NodeData {
  title: string;
  profile?: DirectoryProfile;
  teams: Team[];
  hasReports: boolean;
  baseRole: string | null;
  editable: boolean;
  onEdit: () => void;
}

function PersonNode({ data }: NodeProps<NodeData>) {
  const name = data.profile?.display_name || data.profile?.email?.split('@')[0] || 'Non assegnato';
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div
      className={cn(
        'rounded-lg border bg-card px-3 py-2 w-[220px] shadow-sm transition-colors',
        data.hasReports ? 'border-primary/70 ring-1 ring-primary/25' : 'border-border',
        !data.editable && 'opacity-90',
      )}
      onDoubleClick={data.onEdit}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground/60" />
      <div className="flex items-center gap-2">
        <Avatar className="h-8 w-8">
          {data.profile?.avatar_url ? <AvatarImage src={data.profile.avatar_url} alt={name} /> : null}
          <AvatarFallback className="text-[10px] bg-muted font-semibold">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate text-foreground">{name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{data.title}</p>
        </div>
        {!data.editable && <Lock className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />}
      </div>
      {(data.teams.length > 0 || data.baseRole) && (
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
      <Handle type="source" position={Position.Bottom} className="!bg-primary/70" />
    </div>
  );
}

const nodeTypes = { person: PersonNode };

export function OrgChartPanel() {
  const { user } = useAuth();
  const { isOrgAdmin } = usePermissions();
  const { data: positions = [], isLoading } = useOrgPositions();
  const { data: teams = [] } = useTeams();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: directory = [] } = useOrgDirectory();
  const upsert = useUpsertPosition();
  const del = useDeletePosition();

  const [editing, setEditing] = useState<OrgPosition | null>(null);
  const [dragPos, setDragPos] = useState<Record<string, { x: number; y: number }>>({});

  const profileById = useMemo(
    () => new Map(directory.map(p => [p.id, p])),
    [directory],
  );
  const teamById = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams]);

  /** teams per user (from team_members) + explicit position team */
  const teamsForUser = useCallback((userId: string | null) => {
    if (!userId) return [] as Team[];
    return teamMembers
      .filter(tm => tm.user_id === userId)
      .map(tm => teamById.get(tm.team_id))
      .filter(Boolean) as Team[];
  }, [teamMembers, teamById]);

  const myPositionIds = useMemo(
    () => new Set(positions.filter(p => p.user_id === user?.id).map(p => p.id)),
    [positions, user?.id],
  );
  const myLeadTeams = useMemo(
    () => new Set(teamMembers.filter(tm => tm.user_id === user?.id && tm.member_role === 'lead').map(tm => tm.team_id)),
    [teamMembers, user?.id],
  );

  /** mirrors public.can_manage_member: admin OR direct manager OR team lead of target */
  const canManage = useCallback((p: OrgPosition) => {
    if (isOrgAdmin) return true;
    if (p.manager_id && myPositionIds.has(p.manager_id)) return true;
    if (p.user_id) {
      const targetTeams = teamMembers.filter(tm => tm.user_id === p.user_id).map(tm => tm.team_id);
      if (targetTeams.some(t => myLeadTeams.has(t))) return true;
    }
    return false;
  }, [isOrgAdmin, myPositionIds, myLeadTeams, teamMembers]);

  const hasReportsIds = useMemo(
    () => new Set(positions.map(p => p.manager_id).filter(Boolean) as string[]),
    [positions],
  );

  const nodes: Node<NodeData>[] = useMemo(() => positions.map(p => {
    const pos = dragPos[p.id] || { x: Number(p.x), y: Number(p.y) };
    const explicitTeam = p.team_id ? teamById.get(p.team_id) : undefined;
    const userTeams = teamsForUser(p.user_id);
    const allTeams = explicitTeam && !userTeams.some(t => t.id === explicitTeam.id)
      ? [explicitTeam, ...userTeams]
      : userTeams;
    return {
      id: p.id,
      type: 'person',
      position: pos,
      draggable: canManage(p),
      data: {
        title: p.title,
        profile: p.user_id ? profileById.get(p.user_id) : undefined,
        teams: allTeams,
        hasReports: hasReportsIds.has(p.id),
        baseRole: p.base_role,
        editable: canManage(p),
        onEdit: () => canManage(p) && setEditing(p),
      },
    };
  }), [positions, dragPos, profileById, teamById, teamsForUser, hasReportsIds, canManage]);

  const edges: Edge[] = useMemo(() => positions
    .filter(p => p.manager_id)
    .map(p => ({
      id: `${p.manager_id}-${p.id}`,
      source: p.manager_id as string,
      target: p.id,
      type: 'smoothstep',
      style: { stroke: 'hsl(var(--primary))', strokeWidth: 1.5 },
    })), [positions]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // keep drag fluid locally
    const next = applyNodeChanges(changes, nodes);
    setDragPos(prev => {
      const copy = { ...prev };
      next.forEach(n => { copy[n.id] = n.position; });
      return copy;
    });
  }, [nodes]);

  const onNodeDragStop = useCallback(async (_e: unknown, node: Node) => {
    const p = positions.find(x => x.id === node.id);
    if (!p || !canManage(p)) return;
    try {
      await upsert.mutateAsync({ id: node.id, x: Math.round(node.position.x), y: Math.round(node.position.y) });
    } catch (err: any) {
      toast.error(err.message || 'Impossibile salvare la posizione');
    }
  }, [positions, canManage, upsert]);

  const onConnect = useCallback(async (conn: Connection) => {
    if (!conn.source || !conn.target) return;
    const target = positions.find(p => p.id === conn.target);
    if (!target) return;
    if (!canManage(target)) { toast.error('Non hai i permessi per modificare questa posizione'); return; }
    if (conn.source === conn.target) { toast.error('Una posizione non può riportare a se stessa'); return; }
    try {
      await upsert.mutateAsync({ id: target.id, manager_id: conn.source });
      toast.success('Riporto aggiornato');
    } catch (err: any) {
      toast.error(err.message || 'Aggiornamento non riuscito');
    }
  }, [positions, canManage, upsert]);

  const onEdgesDelete = useCallback(async (deleted: Edge[]) => {
    for (const e of deleted) {
      const target = positions.find(p => p.id === e.target);
      if (!target || !canManage(target)) continue;
      try { await upsert.mutateAsync({ id: target.id, manager_id: null }); } catch { /* noop */ }
    }
  }, [positions, canManage, upsert]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Organigramma
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Trascina i nodi per riposizionarli, collega un nodo a un altro per impostare il responsabile.
              {!isOrgAdmin && ' Puoi modificare solo i tuoi riporti diretti.'}
            </p>
          </div>
          {isOrgAdmin && (
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await upsert.mutateAsync({ title: 'Nuova posizione', x: 80, y: 80 });
                  toast.success('Posizione creata');
                } catch (e: any) { toast.error(e.message || 'Creazione non riuscita'); }
              }}
            >
              <Plus className="w-4 h-4 mr-1" /> Posizione
            </Button>
          )}
        </div>

        <div className="h-[620px] rounded-lg border border-border bg-background">
          {positions.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              Nessuna posizione definita. {isOrgAdmin ? 'Crea la prima posizione.' : ''}
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onNodeDragStop={onNodeDragStop}
              onConnect={onConnect}
              onEdgesDelete={onEdgesDelete}
              nodesConnectable={isOrgAdmin}
              elementsSelectable
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={18} color="hsl(var(--border))" />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable className="!bg-card" />
            </ReactFlow>
          )}
        </div>

        <PositionDialog
          position={editing}
          teams={teams}
          directory={directory}
          positions={positions}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            try {
              await upsert.mutateAsync(patch);
              toast.success('Posizione aggiornata');
              setEditing(null);
            } catch (e: any) { toast.error(e.message || 'Salvataggio non riuscito'); }
          }}
          onDelete={isOrgAdmin ? async (id) => {
            try { await del.mutateAsync(id); toast.success('Posizione eliminata'); setEditing(null); }
            catch (e: any) { toast.error(e.message || 'Eliminazione non riuscita'); }
          } : undefined}
        />
      </CardContent>
    </Card>
  );
}

function PositionDialog({
  position, teams, directory, positions, onClose, onSave, onDelete,
}: {
  position: OrgPosition | null;
  teams: Team[];
  directory: DirectoryProfile[];
  positions: OrgPosition[];
  onClose: () => void;
  onSave: (patch: Partial<OrgPosition> & { id: string }) => void;
  onDelete?: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [userId, setUserId] = useState<string>('none');
  const [teamId, setTeamId] = useState<string>('none');
  const [managerId, setManagerId] = useState<string>('none');
  const [baseRole, setBaseRole] = useState<string>('none');

  const open = !!position;
  // sync when a new position is opened
  const key = position?.id;
  useMemo(() => {
    if (!position) return;
    setTitle(position.title);
    setUserId(position.user_id || 'none');
    setTeamId(position.team_id || 'none');
    setManagerId(position.manager_id || 'none');
    setBaseRole(position.base_role || 'none');
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!position) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Posizione</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Titolo</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Persona</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuna</SelectItem>
                {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Responsabile</Label>
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuno</SelectItem>
                {positions.filter(p => p.id !== position.id).map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Ruolo di riferimento</Label>
            <Select value={baseRole} onValueChange={setBaseRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuno</SelectItem>
                {ORG_ROLES.map(r => <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {onDelete && (
            <Button variant="destructive" size="sm" onClick={() => onDelete(position.id)}>
              <Trash2 className="w-4 h-4 mr-1" /> Elimina
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Annulla</Button>
          <Button
            size="sm"
            onClick={() => onSave({
              id: position.id,
              title: title.trim() || 'Posizione',
              user_id: userId === 'none' ? null : userId,
              team_id: teamId === 'none' ? null : teamId,
              manager_id: managerId === 'none' ? null : managerId,
              base_role: baseRole === 'none' ? null : baseRole,
            })}
          >
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
