import { cn } from '@/lib/utils';
import { parseISO, format } from 'date-fns';
import { Edit, Trash2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GanttRow as GanttRowType, TimelineColumn, DragState } from './types';
import { ROW_HEIGHT, LEFT_PANEL_WIDTH, GROUP_COLORS, STATUS_CONFIG } from './constants';
import { dayToPercent } from './helpers';
import { GanttTaskBar, GanttItemPhaseBars, GanttMilestoneDot } from './GanttTaskBar';
import { ProjectTask } from '@/hooks/useTasks';

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
}

export function GanttRowComponent({
  row, index, columns, timelineStart, totalDays,
  dragging, dragPreview, getMemberName,
  onStatusToggle, onEdit, onDelete, onDragStart,
}: Props) {
  const sConfig = STATUS_CONFIG[row.status] || STATUS_CONFIG.todo;
  const gc = GROUP_COLORS[row.group] || GROUP_COLORS.custom;
  const isDraggingThis = dragging?.rowId === row.id;
  const displayStart = isDraggingThis && dragPreview ? dragPreview.start : row.startDate;
  const displayEnd = isDraggingThis && dragPreview ? dragPreview.end : row.endDate;

  return (
    <div
      className={cn(
        'flex items-center border-b border-border/15 transition-colors group/row relative',
        index % 2 === 0 ? 'bg-transparent' : 'bg-muted/[0.03]',
        isDraggingThis && 'bg-primary/[0.04]'
      )}
      style={{ height: ROW_HEIGHT }}
    >
      {/* Left panel */}
      <div className="flex items-center border-r border-border/30" style={{ width: LEFT_PANEL_WIDTH, minWidth: LEFT_PANEL_WIDTH }}>
        {/* Status checkbox / icon */}
        <div className="flex items-center justify-center w-10 flex-shrink-0">
          {row.type === 'task' && row.task ? (
            <button
              onClick={() => onStatusToggle(row.task!)}
              className={cn(
                'w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex-shrink-0 transition-all duration-200 flex items-center justify-center',
                row.status === 'done'
                  ? 'border-transparent'
                  : row.status === 'in_progress'
                  ? 'border-primary/60 bg-primary/10'
                  : row.status === 'blocked'
                  ? 'bg-[hsl(var(--status-unsafe))]/10'
                  : 'border-muted-foreground/30 hover:border-muted-foreground/50'
              )}
              style={row.status === 'done' ? { background: sConfig.dotColor } : row.status === 'blocked' ? { borderColor: sConfig.dotColor } : undefined}
            >
              {row.status === 'done' && (
                <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              )}
            </button>
          ) : (
            <Package className="w-3.5 h-3.5 text-muted-foreground/50" />
          )}
        </div>

        {/* Task / Item label */}
        <div className="flex-1 min-w-0 pr-2">
          <p className={cn('text-[11px] truncate leading-tight', row.status === 'done' ? 'line-through text-muted-foreground/60' : 'text-foreground/90')} title={row.sublabel || row.label}>
            {row.type === 'item' && row.label !== row.sublabel ? (
              <span className="font-mono text-primary/70 mr-1 text-[10px]">{row.label}</span>
            ) : null}
            {row.type === 'item' ? (row.sublabel || row.label) : row.label}
          </p>
        </div>

        {/* Assignee */}
        <div className="w-[72px] flex-shrink-0 px-1">
          {getMemberName(row.assignee) ? (
            <span className="text-[10px] text-muted-foreground/70 truncate block">{getMemberName(row.assignee)}</span>
          ) : (
            <span className="text-[10px] text-muted-foreground/30">—</span>
          )}
        </div>

        {/* Status */}
        <div className="w-[70px] flex-shrink-0 flex items-center gap-1.5 px-1">
          <div className="w-[6px] h-[6px] rounded-full flex-shrink-0" style={{ background: sConfig.dotColor }} />
          <span className={cn('text-[10px] truncate', sConfig.textClass)}>{sConfig.label}</span>
        </div>

        {/* Dates */}
        <div className="w-[80px] flex-shrink-0 px-1">
          <span className="text-[9px] font-mono text-muted-foreground/50">
            {displayStart ? format(parseISO(displayStart), 'dd/MM') : '—'}
            {displayEnd && displayEnd !== displayStart ? ` → ${format(parseISO(displayEnd), 'dd/MM')}` : ''}
          </span>
        </div>
      </div>

      {/* Timeline area */}
      <div className="flex-1 relative h-full">
        {/* Column grid lines + weekend shading */}
        {columns.map((col, i) => (
          <div
            key={i}
            className={cn(
              'absolute top-0 h-full border-r border-border/[0.06]',
              col.isWeekend && 'bg-muted/[0.04]'
            )}
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

      {/* Hover actions */}
      {row.type === 'task' && row.task && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover/row:flex items-center gap-0.5 bg-card/95 backdrop-blur-sm rounded-md shadow-md border border-border/50 px-0.5 py-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted/30" onClick={() => onEdit(row.task!)}>
            <Edit className="w-3 h-3 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-destructive/10" onClick={() => onDelete(row.task!)}>
            <Trash2 className="w-3 h-3 text-destructive/70" />
          </Button>
        </div>
      )}
    </div>
  );
}
