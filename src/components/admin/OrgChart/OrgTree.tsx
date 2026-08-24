/**
 * OrgTree — rendering a colonne verticali per dipartimento/squadra.
 * Ogni area/squadra è una colonna con intestazione colorata (responsabile in
 * testata) e i membri sotto, collegati da una linea verticale "a pettine".
 * Il modello dati resta invariato: la resa è solo visiva.
 */
import { useState } from 'react';
import type { OrgNode, TodayEntry } from '@/hooks/useOrgChartV3';
import type { DirectoryProfile, Team } from '@/hooks/useOrgStructure';
import { PersonCard, TeamMemberChip } from './PersonCard';
import { ContractorCard, type Contractor } from './ContractorCard';
import { DropZone, TeamBox, UnitBox, CombList, COLUMN_PALETTE } from './TeamBox';

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

export function OrgNodeView({
  node, ctx, color, asColumn = false,
}: { node: OrgNode; ctx: OrgTreeContext; color?: string | null; asColumn?: boolean }) {
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
    const teamColor = team?.color || color;
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
          color={teamColor}
          count={placedUsers.size + extraMembers.length}
          header={
            leadNode ? (
              <PersonCard
                variant="lead"
                node={leadNode}
                profile={leadNode.user_id ? ctx.profiles.get(leadNode.user_id) : undefined}
                today={leadNode.user_id ? ctx.today.get(leadNode.user_id) : undefined}
                extraTeams={leadNode.user_id ? ctx.extraTeams.get(leadNode.user_id) ?? 0 : 0}
                isLead
                draggable={ctx.canEdit && leadNode.can_edit}
                canEdit={ctx.canEdit}
                onOpen={ctx.onOpen}
              />
            ) : undefined
          }
        >
          {members.map((c) => (
            <OrgNodeView key={c.id} node={c} ctx={ctx} color={teamColor} />
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
            <p className="py-2 text-center text-[10px] text-muted-foreground">
              Trascina qui una persona per aggiungerla alla squadra
            </p>
          )}
        </TeamBox>
      </DropZone>
    );
  }

  // Persona con riporti dentro una colonna: nessun box aggiuntivo,
  // solo la scheda e i suoi riporti collegati a pettine.
  if (node.node_kind === 'person' && !asColumn) {
    return (
      <div className="space-y-2">
        <DropZone id={`drop:${node.id}`} nodeId={node.id} disabled={!ctx.canEdit}>
          <PersonCard
            node={node}
            profile={node.user_id ? ctx.profiles.get(node.user_id) : undefined}
            today={node.user_id ? ctx.today.get(node.user_id) : undefined}
            extraTeams={node.user_id ? ctx.extraTeams.get(node.user_id) ?? 0 : 0}
            draggable={draggable}
            canEdit={ctx.canEdit}
            onOpen={ctx.onOpen}
          />
        </DropZone>
        <CombList color={color}>
          {node.children.map((c) => (
            <OrgNodeView key={c.id} node={c} ctx={ctx} color={color} />
          ))}
        </CombList>
      </div>
    );
  }

  // unit / area, oppure persona radice di colonna: testata colorata
  const label = node.node_kind === 'unit'
    ? node.title
    : `${ctx.profiles.get(node.user_id || '')?.display_name || node.title}`;

  return (
    <DropZone id={`drop:${node.id}`} nodeId={node.id} disabled={!ctx.canEdit}>
      <UnitBox
        title={label}
        subtitle={node.node_kind === 'person' ? node.title : undefined}
        color={color}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        lead={
          node.node_kind === 'person' ? (
            <PersonCard
              variant="lead"
              node={node}
              profile={node.user_id ? ctx.profiles.get(node.user_id) : undefined}
              today={node.user_id ? ctx.today.get(node.user_id) : undefined}
              extraTeams={node.user_id ? ctx.extraTeams.get(node.user_id) ?? 0 : 0}
              draggable={ctx.canEdit && node.can_edit}
              canEdit={ctx.canEdit}
              onOpen={ctx.onOpen}
            />
          ) : undefined
        }
      >
        {node.children.length ? (
          node.children.map((c) => <OrgNodeView key={c.id} node={c} ctx={ctx} color={color} />)
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

  // Radice singola con riporti: la testa (es. CEO) resta in alto, i suoi
  // dipartimenti diventano colonne affiancate sotto.
  if (roots.length === 1 && roots[0].children.length > 1 && roots[0].node_kind !== 'team') {
    const head = roots[0];
    return (
      <DropZone id="drop:root" nodeId={null} disabled={!ctx.canEdit} className="space-y-4 p-1">
        <div className="mx-auto w-full max-w-[260px]">
          <DropZone id={`drop:${head.id}`} nodeId={head.id} disabled={!ctx.canEdit}>
            <PersonCard
              node={head}
              profile={head.user_id ? ctx.profiles.get(head.user_id) : undefined}
              today={head.user_id ? ctx.today.get(head.user_id) : undefined}
              extraTeams={head.user_id ? ctx.extraTeams.get(head.user_id) ?? 0 : 0}
              draggable={ctx.canEdit && head.can_edit}
              canEdit={ctx.canEdit}
              onOpen={ctx.onOpen}
            />
          </DropZone>
        </div>
        <Columns nodes={head.children} ctx={ctx} />
      </DropZone>
    );
  }

  return (
    <DropZone id="drop:root" nodeId={null} disabled={!ctx.canEdit} className="p-1">
      <Columns nodes={roots} ctx={ctx} />
    </DropZone>
  );
}

function Columns({ nodes, ctx }: { nodes: OrgNode[]; ctx: OrgTreeContext }) {
  return (
    <div className="flex flex-wrap items-start gap-4">
      {nodes.map((n, i) => (
        <div key={n.id} className="min-w-[240px] max-w-[320px] flex-1">
          <OrgNodeView node={n} ctx={ctx} asColumn color={COLUMN_PALETTE[i % COLUMN_PALETTE.length]} />
        </div>
      ))}
    </div>
  );
}
