/**
 * OrgTree — rendering ricorsivo a scatole annidate.
 * La profondità emerge dai dati: nessun layout engine, solo flex/grid.
 */
import { useState } from 'react';
import type { OrgNode, TodayEntry } from '@/hooks/useOrgChartV3';
import type { DirectoryProfile, Team } from '@/hooks/useOrgStructure';
import { PersonCard } from './PersonCard';
import { ContractorCard, type Contractor } from './ContractorCard';
import { DropZone, TeamBox, UnitBox } from './TeamBox';

export interface OrgTreeContext {
  profiles: Map<string, DirectoryProfile>;
  teams: Map<string, Team>;
  suppliers: Map<string, Contractor>;
  today: Map<string, TodayEntry>;
  extraTeams: Map<string, number>;
  leads: Set<string>;
  canEdit: boolean;
  onOpen: (node: OrgNode) => void;
}

export function OrgNodeView({ node, ctx }: { node: OrgNode; ctx: OrgTreeContext }) {
  const [collapsed, setCollapsed] = useState(node.depth >= 3);
  const draggable = ctx.canEdit && node.can_edit;

  if (node.node_kind === 'contractor') {
    return (
      <ContractorCard
        node={node}
        supplier={node.supplier_id ? ctx.suppliers.get(node.supplier_id) : undefined}
        draggable={draggable}
        onOpen={ctx.onOpen}
      />
    );
  }

  if (node.node_kind === 'person' && node.children.length === 0) {
    return (
      <PersonCard
        node={node}
        profile={node.user_id ? ctx.profiles.get(node.user_id) : undefined}
        today={node.user_id ? ctx.today.get(node.user_id) : undefined}
        extraTeams={node.user_id ? ctx.extraTeams.get(node.user_id) ?? 0 : 0}
        isLead={!!node.user_id && ctx.leads.has(node.user_id)}
        draggable={draggable}
        onOpen={ctx.onOpen}
      />
    );
  }

  if (node.node_kind === 'team') {
    const team = node.team_id ? ctx.teams.get(node.team_id) : undefined;
    const leadNode = node.children.find((c) => c.user_id && ctx.leads.has(c.user_id));
    const members = node.children.filter((c) => c !== leadNode);
    return (
      <DropZone id={`drop:${node.id}`} nodeId={node.id} disabled={!ctx.canEdit}>
        <TeamBox
          title={team?.name || node.title}
          color={team?.color}
          count={node.children.length}
          header={
            leadNode ? <OrgNodeView node={leadNode} ctx={ctx} /> : undefined
          }
        >
          {members.map((c) => (
            <OrgNodeView key={c.id} node={c} ctx={ctx} />
          ))}
        </TeamBox>
      </DropZone>
    );
  }

  // unit / area, oppure persona con riporti: contenitore annidato
  const label = node.node_kind === 'unit'
    ? node.title
    : `${ctx.profiles.get(node.user_id || '')?.display_name || node.title}`;

  return (
    <DropZone id={`drop:${node.id}`} nodeId={node.id} disabled={!ctx.canEdit}>
      <UnitBox
        title={label}
        subtitle={node.node_kind === 'person' ? node.title : undefined}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
      >
        {node.node_kind === 'person' && (
          <PersonCard
            node={node}
            profile={node.user_id ? ctx.profiles.get(node.user_id) : undefined}
            today={node.user_id ? ctx.today.get(node.user_id) : undefined}
            extraTeams={node.user_id ? ctx.extraTeams.get(node.user_id) ?? 0 : 0}
            draggable={ctx.canEdit && node.can_edit}
            onOpen={ctx.onOpen}
          />
        )}
        <div className="flex flex-wrap gap-2 items-start">
          {node.children.map((c) => (
            <div key={c.id} className="min-w-[220px] flex-1">
              <OrgNodeView node={c} ctx={ctx} />
            </div>
          ))}
        </div>
      </UnitBox>
    </DropZone>
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
    <DropZone id="drop:root" nodeId={null} disabled={!ctx.canEdit} className="space-y-3">
      {roots.map((n) => (
        <OrgNodeView key={n.id} node={n} ctx={ctx} />
      ))}
    </DropZone>
  );
}
