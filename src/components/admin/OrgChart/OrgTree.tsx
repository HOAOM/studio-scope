/**
 * OrgTree — organigramma classico: schede collegate da linee, un livello alla
 * volta. Nessun contenimento fisico: le squadre sono un badge colorato sulla
 * scheda, non una scatola che ne contiene altre.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import type { OrgNode, TodayEntry } from '@/hooks/useOrgChartV3';
import type { DirectoryProfile, Team } from '@/hooks/useOrgStructure';
import { PersonCard, TeamMemberChip } from './PersonCard';
import { ContractorCard, type Contractor } from './ContractorCard';
import { DropZone, hexToRgba } from './TeamBox';
import { cn } from '@/lib/utils';

export interface OrgTreeContext {
  profiles: Map<string, DirectoryProfile>;
  teams: Map<string, Team>;
  suppliers: Map<string, Contractor>;
  today: Map<string, TodayEntry>;
  extraTeams: Map<string, number>;
  /** caposquadra per squadra: team_id -> insieme di user_id con member_role = 'lead' */
  leadsByTeam: Map<string, Set<string>>;
  /** composizione reale delle squadre: team_id -> user_id[] (da team_members) */
  membersByTeam: Map<string, string[]>;
  canEdit: boolean;
  onOpen: (node: OrgNode) => void;
  /** modalità "click per collegare": id del nodo in attesa di un padre */
  linkingId?: string | null;
  onStartLink?: (node: OrgNode) => void;
  onPickParent?: (parentId: string | null) => void;
}

const CARD_W = 200;

function teamBadge(ctx: OrgTreeContext, node: OrgNode) {
  const team = node.team_id ? ctx.teams.get(node.team_id) : undefined;
  return team ? { name: team.name, color: team.color } : undefined;
}

/** Scheda del nodo (persona / appaltatore / squadra) senza figli. */
function NodeCard({ node, ctx }: { node: OrgNode; ctx: OrgTreeContext }) {
  const draggable = ctx.canEdit && node.can_edit;

  if (node.node_kind === 'contractor') {
    return (
      <div style={{ width: CARD_W }}>
        <ContractorCard
          node={node}
          supplier={node.supplier_id ? ctx.suppliers.get(node.supplier_id) : undefined}
          draggable={draggable}
          canEdit={ctx.canEdit}
          onOpen={ctx.onOpen}
        />
      </div>
    );
  }

  if (node.node_kind === 'team' || node.node_kind === 'unit') {
    const team = node.team_id ? ctx.teams.get(node.team_id) : undefined;
    const color = team?.color || '#64748b';
    const count = node.team_id ? (ctx.membersByTeam.get(node.team_id) || []).length : node.children.length;
    return (
      <button
        type="button"
        onClick={() => ctx.onOpen(node)}
        data-testid={`card-${node.id}`}
        style={{ width: CARD_W, background: hexToRgba(color, 0.14), borderColor: hexToRgba(color, 0.55) }}
        className="flex items-center gap-2 rounded-lg border px-2 py-2 text-left shadow-sm transition-shadow hover:shadow-md"
      >
        <Users className="h-3.5 w-3.5 shrink-0" style={{ color }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-bold uppercase tracking-wide">
            {team?.name || node.title}
          </span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {node.node_kind === 'team' ? `Squadra · ${count} membri` : 'Area / dipartimento'}
          </span>
        </span>
      </button>
    );
  }

  return (
    <PersonCard
      node={node}
      profile={node.user_id ? ctx.profiles.get(node.user_id) : undefined}
      today={node.user_id ? ctx.today.get(node.user_id) : undefined}
      extraTeams={node.user_id ? Math.max(0, (ctx.extraTeams.get(node.user_id) ?? 0)) : 0}
      isLead={!!node.user_id && !!node.team_id && !!ctx.leadsByTeam.get(node.team_id)?.has(node.user_id)}
      team={teamBadge(ctx, node)}
      draggable={draggable}
      canEdit={ctx.canEdit}
      onOpen={ctx.onOpen}
      onStartLink={ctx.onStartLink}
    />
  );
}

export function OrgNodeView({ node, ctx }: { node: OrgNode; ctx: OrgTreeContext; color?: string | null; asColumn?: boolean }) {
  const [collapsed, setCollapsed] = useState(false);

  // membri della squadra senza scheda propria: mostrati come figli "chip"
  const placed = new Set(node.children.map((c) => c.user_id).filter(Boolean) as string[]);
  const ghostMembers =
    node.node_kind === 'team' && node.team_id
      ? (ctx.membersByTeam.get(node.team_id) || []).filter((u) => !placed.has(u))
      : [];

  const childCount = node.children.length + ghostMembers.length;
  const linking = ctx.linkingId && ctx.linkingId !== node.id;
  const isLinkSource = ctx.linkingId === node.id;

  return (
    <div className="flex flex-col items-center">
      <DropZone id={`drop:${node.id}`} nodeId={node.id} disabled={!ctx.canEdit} className="relative">
        <div className={cn(isLinkSource && 'ring-2 ring-primary rounded-lg')}>
          <NodeCard node={node} ctx={ctx} />
        </div>
        {linking && (
          <button
            type="button"
            data-testid={`pick-${node.id}`}
            onClick={() => ctx.onPickParent?.(node.id)}
            className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-primary/80 text-[11px] font-semibold text-primary-foreground"
          >
            Collega qui
          </button>
        )}
      </DropZone>

      {childCount > 0 && (
        <>
          <button
            type="button"
            aria-label={collapsed ? 'Espandi riporti' : 'Comprimi riporti'}
            onClick={() => setCollapsed((v) => !v)}
            className="mt-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground"
          >
            {collapsed ? <ChevronRight className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
          </button>
          {collapsed ? (
            <span className="mt-1 text-[9px] text-muted-foreground">{childCount} riporti nascosti</span>
          ) : (
            <>
              <span aria-hidden className="h-4 w-px bg-border" />
              <ChildrenRow>
                {node.children.map((c) => (
                  <OrgNodeView key={c.id} node={c} ctx={ctx} />
                ))}
                {ghostMembers.map((u) => (
                  <TeamMemberChip
                    key={u}
                    profile={ctx.profiles.get(u)}
                    today={ctx.today.get(u)}
                    isLead={!!node.team_id && !!ctx.leadsByTeam.get(node.team_id)?.has(u)}
                  />
                ))}
              </ChildrenRow>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Riga di figli con linea orizzontale e stanghette verticali (albero classico). */
function ChildrenRow({ children }: { children: React.ReactNode }) {
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean) as React.ReactNode[];
  if (!items.length) return null;
  const single = items.length === 1;
  return (
    <div className="relative flex items-start justify-center pt-4">
      {!single && (
        <span
          aria-hidden
          className="absolute top-0 h-px bg-border"
          style={{ left: `${100 / (items.length * 2)}%`, right: `${100 / (items.length * 2)}%` }}
        />
      )}
      {items.map((child, i) => (
        <div key={i} className="relative flex flex-1 basis-0 flex-col items-center px-3">
          <span aria-hidden className="absolute left-1/2 top-0 h-4 w-px bg-border" />
          {child}
        </div>
      ))}
    </div>
  );
}

export function OrgTree({ roots, ctx }: { roots: OrgNode[]; ctx: OrgTreeContext }) {
  if (!roots.length) {
    return (
      <DropZone id="drop:root" nodeId={null} disabled={!ctx.canEdit}>
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
          Nessuna posizione ancora nell'organigramma.
          {ctx.canEdit && ' Trascina qui una persona o una voce del catalogo per iniziare.'}
        </p>
      </DropZone>
    );
  }

  return (
    <DropZone id="drop:root" nodeId={null} disabled={!ctx.canEdit} className="overflow-x-auto p-2">
      <div className="inline-flex min-w-full items-start justify-center gap-10 pb-4">
        {roots.map((n) => (
          <OrgNodeView key={n.id} node={n} ctx={ctx} />
        ))}
      </div>
    </DropZone>
  );
}
