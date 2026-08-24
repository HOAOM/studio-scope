/**
 * PersonCard — scheda persona dell'organigramma v3.
 * Maniglia di trascinamento separata dal click che apre il pannello dettaglio.
 */
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { OrgNode, TodayEntry } from '@/hooks/useOrgChartV3';
import type { DirectoryProfile } from '@/hooks/useOrgStructure';
import { GripVertical, Lock, Star } from 'lucide-react';

export interface PersonCardProps {
  node: OrgNode;
  profile?: DirectoryProfile;
  today?: TodayEntry;
  extraTeams: number;
  isLead?: boolean;
  /** L'utente può modificare l'organigramma in generale. */
  canEdit?: boolean;
  /** Questa specifica scheda è trascinabile. */
  draggable?: boolean;
  onOpen: (node: OrgNode) => void;
}

const STATUS_LABEL: Record<string, string> = {
  working: 'Lavoro organizzato oggi',
  absent: 'Assente oggi',
  idle: 'Nessun impegno registrato oggi',
};

export function StatusDot({ today }: { today?: TodayEntry }) {
  const status = today?.status ?? 'idle';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={STATUS_LABEL[status]}
          className={cn(
            'inline-block w-2.5 h-2.5 rounded-full shrink-0 border',
            status === 'working' && 'bg-status-safe border-status-safe',
            status === 'absent' && 'bg-background border-status-unsafe relative overflow-hidden',
            status === 'idle' && 'bg-muted border-border',
          )}
        >
          {status === 'absent' && (
            <span className="absolute left-1/2 top-1/2 h-[1.5px] w-[140%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-status-unsafe" />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {STATUS_LABEL[status]}
        {today?.label ? ` — ${today.label}` : ''}
      </TooltipContent>
    </Tooltip>
  );
}

/** Maniglia di trascinamento: unico elemento che riceve i listener del drag. */
export function DragHandle({
  nodeId, draggable, canEdit, setNodeRef, listeners, attributes,
}: {
  nodeId: string;
  draggable: boolean;
  canEdit: boolean;
  setNodeRef: (el: HTMLElement | null) => void;
  listeners: any;
  attributes: any;
}) {
  if (canEdit && !draggable) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid={`lock-${nodeId}`}
            className="flex h-6 w-5 shrink-0 cursor-not-allowed items-center justify-center text-muted-foreground/60"
          >
            <Lock className="h-3 w-3" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Non puoi spostare questa scheda: è fuori dal tuo perimetro di gestione.
        </TooltipContent>
      </Tooltip>
    );
  }
  if (!draggable) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          ref={setNodeRef as any}
          {...attributes}
          {...listeners}
          data-testid={`handle-${nodeId}`}
          role="button"
          aria-label="Trascina per riassegnare"
          style={{ touchAction: 'none' }}
          className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-accent active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Trascina per riassegnare</TooltipContent>
    </Tooltip>
  );
}

export function PersonCard({
  node, profile, today, extraTeams, isLead, canEdit = false, draggable, onOpen,
}: PersonCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: `node:${node.id}`,
    data: { kind: 'node', nodeId: node.id },
    disabled: !draggable,
  });

  const name = profile?.display_name || profile?.email || 'Posizione vacante';
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), zIndex: isDragging ? 50 : undefined }}
      className={cn(
        'flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-1.5 w-full min-w-0',
        isLead && 'bg-transparent border-transparent',
        node.is_ancestor && 'opacity-60 border-dashed',
        isDragging && 'opacity-70 shadow-lg ring-1 ring-primary',
      )}
    >
      <DragHandle
        nodeId={node.id}
        draggable={!!draggable}
        canEdit={canEdit}
        setNodeRef={setActivatorNodeRef}
        listeners={listeners}
        attributes={attributes}
      />
      <button
        type="button"
        onClick={() => onOpen(node)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded text-left transition-colors hover:bg-accent/50 px-1 py-0.5"
      >
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarImage src={profile?.avatar_url || undefined} alt={name} />
          <AvatarFallback className="text-[10px]">{initials || '—'}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {isLead && <Star className="h-3 w-3 shrink-0" />}
            <span className="truncate text-xs font-medium">{name}</span>
            <StatusDot today={today} />
          </span>
          <span className="flex items-center gap-1">
            <span className="truncate text-[10px] text-muted-foreground">{node.title}</span>
            {extraTeams > 0 && (
              <span className="rounded bg-secondary px-1 text-[9px] text-muted-foreground">+{extraTeams}</span>
            )}
          </span>
        </span>
      </button>
    </div>
  );
}

/** Membro di squadra presente in team_members ma senza scheda nell'organigramma. */
export function TeamMemberChip({
  profile, today, isLead,
}: { profile?: DirectoryProfile; today?: TodayEntry; isLead?: boolean }) {
  const name = profile?.display_name || profile?.email || 'Membro';
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-border/70 bg-card/50 px-2 py-1.5 min-w-0">
      <Avatar className="h-6 w-6 shrink-0">
        <AvatarImage src={profile?.avatar_url || undefined} alt={name} />
        <AvatarFallback className="text-[9px]">{initials || '—'}</AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 items-center gap-1.5">
        {isLead && <Star className="h-3 w-3 shrink-0" />}
        <span className="truncate text-xs">{name}</span>
        <StatusDot today={today} />
      </span>
    </div>
  );
}
