import { cn } from '@/lib/utils';
import { parseISO, format } from 'date-fns';
import { Edit, Trash2, Package, MessageSquare, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GanttRow as GanttRowType, TimelineColumn, DragState, ItemTag } from './types';
import { ROW_HEIGHT, LEFT_PANEL_WIDTH, GROUP_COLORS, STATUS_CONFIG } from './constants';
import { dayToPercent } from './helpers';
import { GanttTaskBar, GanttItemPhaseBars, GanttMilestoneDot } from './GanttTaskBar';
import { ProjectTask } from '@/hooks/useTasks';

// ─── Tag Badges ───

const TAG_CONFIG: Record<ItemTag, { label: string; className: string }> = {
  on_hold:   { label: 'On Hold',   className: 'bg-[hsl(var(--status-unsafe))]/15 text-[hsl(var(--status-unsafe))] border-[hsl(var(--status-unsafe))]/20' },
  cancelled: { label: 'Cancelled', className: 'bg-muted/50 text-muted-foreground line-through border-muted-foreground/20' },
  at_risk:   { label: 'At Risk',   className: 'bg-[hsl(var(--status-at-risk))]/15 text-[hsl(var(--status-at-risk))] border-[hsl(var(--status-at-risk))]/20' },
  delayed:   { label: 'Delayed',   className: 'bg-destructive/15 text-destructive border-destructive/20' },
  options:   { label: 'Options',   className: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
  revision:  { label: '',          className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
};

function ItemTags({ tags, revisionNumber }: { tags?: ItemTag[]; revisionNumber?: number }) {
  if (!tags?.length) return null;
  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      {tags.map(tag => {
        const conf = TAG_CONFIG[tag];
        const label = tag === 'revision' ? `R${revisionNumber || 1}` : conf.label;
        return (
          <span key={tag} className={cn('text-[7px] font-semibold px-1 py-px rounded border leading-tight', conf.className)}>
            {label}
          </span>
        );
      })}
    </div>
  );
}

// ─── Main Row Component ───

interface Props {
  row: GanttRowType;
  index: number;
  columns: TimelineColumn[];
  timelineStart: Date;
  totalDays: number;
  dragging: DragState | null;
  dragPreview: { start: string; end: string } | null;
  getMemberName: (id: string | undefined) => string;
  onStatusToggle: (task: ProjectTask) => void;
  onEdit: (task: ProjectTask) => void;
  onDelete: (task: ProjectTask) => void;
  onDragStart: (e: React.MouseEvent, rowId: string, edge: 'start' | 'end' | 'move', startDate: string, endDate: string) => void;
  onItemDoubleClick?: (itemId: string) => void;
  isCriticalPath?: boolean;
}

export function GanttRowComponent({
  row, index, columns, timelineStart, totalDays,
  dragging, dragPreview, getMemberName,
  onStatusToggle, onEdit, onDelete, onDragStart,
  onItemDoubleClick,
  isCriticalPath = false,
}: Props) {
  const sConfig = STATUS_CONFIG[row.status] || STATUS_CONFIG.todo;
  const gc = GROUP_COLORS[row.group] || GROUP_COLORS.custom;
  const isDraggingThis = dragging?.rowId === row.id;
  const displayStart = isDraggingThis && dragPreview ? dragPreview.start : row.startDate;
  const displayEnd = isDraggingThis && dragPreview ? dragPreview.end : row.endDate;

  return (
    <div
      className={cn(
        'flex items-center border-b border-border/10 transition-colors group/row relative',
        index % 2 === 0 ? 'bg-transparent' : 'bg-muted/[0.02]',
        isDraggingThis && 'bg-primary/[0.04]',
        isCriticalPath && 'bg-destructive/[0.02]',
        row.delayed && !row.isCancelled && 'bg-destructive/[0.03]',
        row.atRisk && !row.delayed && 'bg-[hsl(var(--status-at-risk))]/[0.03]',
        row.isOnHold && 'opacity-70',
        row.isCancelled && 'opacity-50',
        row.type === 'item' && 'cursor-pointer',
      )}
      style={{ height: ROW_HEIGHT }}
      onDoubleClick={() => {
        if (row.type === 'item' && row.itemId && onItemDoubleClick) {
          onItemDoubleClick(row.itemId);
        }
      }}
    >
      {/* ── Left Panel ── */}
      <div className="sticky left-0 z-10 flex items-center border-r border-border/20" style={{ width: LEFT_PANEL_WIDTH, minWidth: LEFT_PANEL_WIDTH, backgroundColor: 'hsl(var(--card))' }}>
        {/* Icon */}
        <div className={cn('flex items-center justify-center flex-shrink-0', row.isSubTask ? 'w-8 pl-3' : 'w-8')}>
          {row.type === 'task' && row.task ? (
            (() => {
              const hasAutoComplete = row.task && (row.task as any).completion_fields?.length > 0;
              return (
                <button
                  onClick={() => !hasAutoComplete && onStatusToggle(row.task!)}
                  className={cn(
                    'w-[16px] h-[16px] rounded-[4px] border-[1.5px] flex-shrink-0 transition-all flex items-center justify-center',
                    hasAutoComplete && row.status !== 'done' && 'border-primary/30 bg-primary/5 cursor-not-allowed',
                    !hasAutoComplete && row.status === 'done' ? 'border-transparent' :
                    !hasAutoComplete && row.status === 'in_progress' ? 'border-primary/50 bg-primary/10' :
                    !hasAutoComplete && row.status === 'blocked' ? 'bg-[hsl(var(--status-unsafe))]/10' :
                    !hasAutoComplete ? 'border-muted-foreground/25 hover:border-muted-foreground/45' : ''
                  )}
                  style={row.status === 'done' ? { background: sConfig.dotColor } : row.status === 'blocked' ? { borderColor: sConfig.dotColor } : undefined}
                  title={hasAutoComplete ? 'Auto-completes when fields are filled' : undefined}
                >
                  {row.status === 'done' && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  )}
                </button>
              );
            })()
          ) : (
            <Package className="w-3 h-3 text-muted-foreground/40" />
          )}
        </div>

        {/* Label + Tags */}
        <div className={cn('flex-1 min-w-0 pr-1.5 flex items-center gap-1', row.isSubTask && 'pl-1')}>
          <div className="min-w-0 flex-1">
            <p className={cn(
              'text-[10px] truncate leading-tight',
              row.status === 'done' || row.isCancelled ? 'line-through text-muted-foreground/50' : 'text-foreground/85',
              row.isSubTask && 'italic text-muted-foreground/70',
            )} title={row.sublabel || row.label}>
              {row.type === 'item' && row.label !== row.sublabel && (
                <span className="font-mono text-primary/60 mr-1 text-[9px]">{row.label}</span>
              )}
              {row.type === 'item' ? (row.sublabel || row.label) : row.label}
            </p>
          </div>
          <ItemTags tags={row.tags} revisionNumber={row.revisionNumber} />
          
          {/* Task/note indicators */}
          {row.type === 'item' && (row.openTaskCount || 0) > 0 && (
            <span className="text-[8px] text-muted-foreground/50 font-mono flex-shrink-0">
              {row.openTaskCount}
              <AlertTriangle className="w-2 h-2 inline ml-px" />
            </span>
          )}
        </div>

        {/* Status dot + label */}
        <div className="w-[60px] flex-shrink-0 flex items-center gap-1 px-1">
          <div className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: sConfig.dotColor }} />
          <span className={cn('text-[9px] truncate', sConfig.textClass)}>{sConfig.label}</span>
        </div>

        {/* Dates (compact) */}
        <div className="w-[65px] flex-shrink-0 px-1">
          <span className="text-[8px] font-mono text-muted-foreground/40">
            {displayStart ? format(parseISO(displayStart), 'dd/MM') : '—'}
            {displayEnd && displayEnd !== displayStart ? ` → ${format(parseISO(displayEnd), 'dd/MM')}` : ''}
          </span>
        </div>
      </div>

      {/* ── Timeline Area ── */}
      <div className="flex-1 relative h-full">
        {/* Grid lines */}
        {columns.map((col, i) => (
          <div
            key={i}
            className={cn('absolute top-0 h-full border-r border-border/[0.08]', col.isWeekend && 'bg-muted/[0.04]')}
            style={{ left: `${dayToPercent(col.startDay, totalDays)}%`, width: `${dayToPercent(col.widthDays, totalDays)}%` }}
          />
        ))}

        {/* Bars */}
        {row.type === 'task' ? (
          displayStart && displayEnd ? (
            <GanttTaskBar
              row={row}
              displayStart={displayStart}
              displayEnd={displayEnd}
              timelineStart={timelineStart}
              totalDays={totalDays}
              isDragging={isDraggingThis}
              onDragStart={(e, edge) => row.task && onDragStart(e, row.id, edge, displayStart, displayEnd)}
            />
          ) : displayStart ? (
            <GanttMilestoneDot date={displayStart} timelineStart={timelineStart} totalDays={totalDays} color={gc.bar} />
          ) : null
        ) : (
          <GanttItemPhaseBars row={row} timelineStart={timelineStart} totalDays={totalDays} />
        )}
      </div>

      {/* Hover actions for tasks */}
      {row.type === 'task' && row.task && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover/row:flex items-center gap-0.5 bg-card/95 backdrop-blur-sm rounded-md shadow-sm border border-border/40 px-0.5 py-0.5">
          <Button variant="ghost" size="icon" className="h-5 w-5 hover:bg-muted/30" onClick={() => onEdit(row.task!)}>
            <Edit className="w-2.5 h-2.5 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5 hover:bg-destructive/10" onClick={() => onDelete(row.task!)}>
            <Trash2 className="w-2.5 h-2.5 text-destructive/60" />
          </Button>
        </div>
      )}
    </div>
  );
}
