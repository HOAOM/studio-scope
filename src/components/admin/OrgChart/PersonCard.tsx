/**
 * PersonCard — scheda persona dell'organigramma v3.
 * Nome, posizione, foto, pallino di stato di oggi, badge squadre secondarie.
 */
import { useDraggable } from '@dnd-kit/core';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { OrgNode, TodayEntry } from '@/hooks/useOrgChartV3';
import type { DirectoryProfile } from '@/hooks/useOrgStructure';
import { Star } from 'lucide-react';

export interface PersonCardProps {
  node: OrgNode;
  profile?: DirectoryProfile;
  today?: TodayEntry;
  extraTeams: number;
  isLead?: boolean;
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

export function PersonCard({ node, profile, today, extraTeams, isLead, draggable, onOpen }: PersonCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `node:${node.id}`,
    data: { kind: 'node', nodeId: node.id },
    disabled: !draggable,
  });

  const name = profile?.display_name || profile?.email || 'Posizione vacante';
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      onClick={() => onOpen(node)}
      className={cn(
        'flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-left transition-colors hover:bg-accent/50 w-full min-w-0',
        isLead && 'bg-transparent border-transparent hover:bg-black/10',
        node.is_ancestor && 'opacity-60 border-dashed',
        isDragging && 'opacity-40',
      )}
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
  );
}
