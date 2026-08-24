/**
 * OrgTree — rendering ricorsivo a scatole annidate.
 * La profondità emerge dai dati: nessun layout engine, solo flex/grid.
 */
import { useState } from 'react';
import type { OrgNode, TodayEntry } from '@/hooks/useOrgChartV3';
import type { DirectoryProfile, Team } from '@/hooks/useOrgStructure';
import { PersonCard, TeamMemberChip } from './PersonCard';
import { ContractorCard, type Contractor } from './ContractorCard';
import { DropZone, TeamBox, UnitBox } from './TeamBox';

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
}

export function OrgNodeView({ node, ctx }: { node: OrgNode; ctx: OrgTreeContext }) {
  const [collapsed, setCollapsed] = useState(node.depth >= 4);
  const draggable = ctx.canEdit && node.can_edit;

  if (node.node_kind === 'contractor') {
    return (
      <DropZone id={`drop:${node.id}`} nodeId={node.id} disabled={!ctx.canEdit}>
        <ContractorCard
          node={node}
          supplier={node.supplier_id ? ctx.suppliers.get(node.supplier_id) : undefined}
          draggable={draggable}
          canEdit={ctx.canEdit}
          onOpen={ctx.onOpen}
        />
      </DropZone>
    );
  }

  if (node.node_kind === 'person' && node.children.length === 0) {
    const teamLeads = node.team_id ? ctx.leadsByTeam.get(node.team_id) : undefined;
    return (
      <DropZone id={`drop:${node.id}`} nodeId={node.id} disabled={!ctx.canEdit}>
        <PersonCard
          node={node}
          profile={node.user_id ? ctx.profiles.get(node.user_id) : undefined}
          today={node.user_id ? ctx.today.get(node.user_id) : undefined}
          extraTeams={node.user_id ? ctx.extraTeams.get(node.user_id) ?? 0 : 0}
          isLead={!!node.user_id && !!teamLeads?.has(node.user_id)}
          draggable={draggable}
          canEdit={ctx.canEdit}
          onOpen={ctx.onOpen}
        />
      </DropZone>
    );
  }

  if (node.node_kind === 'team') {
    const team = node.team_id ? ctx.teams.get(node.team_id) : undefined;
    const leads = (node.team_id && ctx.leadsByTeam.get(node.team_id)) || new Set<string>();
    const leadNode = node.children.find((c) => c.user_id && leads.has(c.user_id));
    const members = node.children.filter((c) => c !== leadNode);
    const placedUsers = new Set(node.children.map((c) => c.user_id).filter(Boolean) as string[]);
    const extraMembers = ((node.team_id && ctx.membersByTeam.get(node.team_id)) || []).filter(
      (u) => !placedUsers.has(u),
    );
    return (
      <DropZone id={`drop:${node.id}`} nodeId={node.id} disabled={!ctx.canEdit}>
        <TeamBox
          title={team?.name || node.title}
          color={team?.color}
          count={placedUsers.size + extraMembers.length}
          header={leadNode ? <OrgNodeView node={leadNode} ctx={ctx} /> : undefined}
        >
          {members.map((c) => (
            <OrgNodeView key={c.id} node={c} ctx={ctx} />
          ))}
          {extraMembers.map((u) => (
            <TeamMemberChip
              key={u}
              profile={ctx.profiles.get(u)}
              today={ctx.today.get(u)}
              isLead={leads.has(u)}
            />
          ))}
          {!members.length && !extraMembers.length && (
            <p className="col-span-full py-2 text-center text-[10px] text-muted-foreground">
              Trascina qui una persona per aggiungerla alla squadra
            </p>
          )}
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
            canEdit={ctx.canEdit}
            onOpen={ctx.onOpen}
          />
        )}
        {node.children.length ? (
          <div className="flex flex-wrap gap-2 items-start">
            {node.children.map((c) => (
              <div key={c.id} className="min-w-[220px] flex-1">
                <OrgNodeView node={c} ctx={ctx} />
              </div>
            ))}
          </div>
        ) : (
          <p className="py-1 text-[10px] text-muted-foreground">
            Nessun riporto. Trascina qui una persona, una squadra o un appaltatore.
          </p>
        )}
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
    <DropZone id="drop:root" nodeId={null} disabled={!ctx.canEdit} className="space-y-3 p-1">
      {roots.map((n) => (
        <OrgNodeView key={n.id} node={n} ctx={ctx} />
      ))}
    </DropZone>
  );
}
