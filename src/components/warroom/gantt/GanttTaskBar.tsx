import { cn } from '@/lib/utils';
import { differenceInDays, parseISO, format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { GanttRow } from './types';
import { GROUP_COLORS, ITEM_PHASE_STYLES } from './constants';
import { dayToPercent } from './helpers';

interface TaskBarProps {
  row: GanttRow;
  displayStart: string;
  displayEnd: string;
  timelineStart: Date;
  totalDays: number;
  isDragging: boolean;
  onDragStart: (e: React.MouseEvent, edge: 'start' | 'end' | 'move') => void;
}

export function GanttTaskBar({ row, displayStart, displayEnd, timelineStart, totalDays, isDragging, onDragStart }: TaskBarProps) {
  const gc = GROUP_COLORS[row.group] || GROUP_COLORS.custom;
  const barLeft = dayToPercent(differenceInDays(parseISO(displayStart), timelineStart), totalDays);
  const barWidth = Math.max(dayToPercent(differenceInDays(parseISO(displayEnd), parseISO(displayStart)), totalDays), 0.5);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 rounded-[5px] overflow-hidden transition-all duration-150',
              isDragging ? 'shadow-[0_0_12px_rgba(var(--primary),0.3)] ring-1 ring-primary/40 scale-[1.02]' : 'hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)]',
              'cursor-grab active:cursor-grabbing'
            )}
            style={{
              left: `${barLeft}%`,
              width: `${barWidth}%`,
              minWidth: 12,
              height: 24,
            }}
            onMouseDown={(e) => onDragStart(e, 'move')}
          >
            {/* Full bar background */}
            <div
              className="absolute inset-0 rounded-[5px]"
              style={{ background: gc.barGradient, opacity: 0.25 }}
            />
            {/* Progress fill */}
            <div
              className="absolute inset-y-0 left-0 rounded-l-[5px]"
              style={{
                width: `${row.progress}%`,
                background: gc.barGradient,
                opacity: 0.9,
              }}
            />
            {/* Right edge for progress */}
            {row.progress > 0 && row.progress < 100 && (
              <div
                className="absolute top-0 bottom-0 w-px"
                style={{
                  left: `${row.progress}%`,
                  background: gc.bar,
                  opacity: 0.6,
                }}
              />
            )}
            {/* Label */}
            <span className="relative z-10 text-[10px] text-foreground font-medium px-2 truncate block leading-[24px] drop-shadow-sm">
              {row.label}
            </span>
            {/* Resize handles with visual indicator */}
            <div
              className="absolute left-0 top-0 bottom-0 w-[6px] cursor-col-resize group/handle"
              onMouseDown={(e) => { e.stopPropagation(); onDragStart(e, 'start'); }}
            >
              <div className="absolute inset-y-[6px] left-[2px] w-[2px] rounded-full bg-foreground/0 group-hover/handle:bg-foreground/40 transition-colors" />
            </div>
            <div
              className="absolute right-0 top-0 bottom-0 w-[6px] cursor-col-resize group/handle"
              onMouseDown={(e) => { e.stopPropagation(); onDragStart(e, 'end'); }}
            >
              <div className="absolute inset-y-[6px] right-[2px] w-[2px] rounded-full bg-foreground/0 group-hover/handle:bg-foreground/40 transition-colors" />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-[240px] p-3" side="top">
          <p className="text-xs font-semibold mb-1">{row.label}</p>
          <p className="text-[11px] text-muted-foreground">
            {format(parseISO(displayStart), 'dd MMM yyyy')} → {format(parseISO(displayEnd), 'dd MMM yyyy')}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-muted/60 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${row.progress}%`, background: gc.barGradient }} />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">{row.progress}%</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ── Item multi-phase bar ── */
interface ItemPhaseBarsProps {
  row: GanttRow;
  timelineStart: Date;
  totalDays: number;
}

export function GanttItemPhaseBars({ row, timelineStart, totalDays }: ItemPhaseBarsProps) {
  if (!row.phases?.length) return null;

  return (
    <>
      {/* Connecting line between phases */}
      {row.phases.length > 1 && (() => {
        const firstStart = differenceInDays(parseISO(row.phases[0].start), timelineStart);
        const lastPhase = row.phases[row.phases.length - 1];
        const lastEnd = lastPhase.end
          ? differenceInDays(parseISO(lastPhase.end), timelineStart)
          : differenceInDays(parseISO(lastPhase.start), timelineStart) + 3;
        return (
          <div
            className="absolute top-1/2 h-px"
            style={{
              left: `${dayToPercent(firstStart, totalDays)}%`,
              width: `${dayToPercent(lastEnd - firstStart, totalDays)}%`,
              background: 'hsl(var(--muted-foreground))',
              opacity: 0.15,
            }}
          />
        );
      })()}

      {row.phases.map(phase => {
        const style = ITEM_PHASE_STYLES[phase.key];
        const s = differenceInDays(parseISO(phase.start), timelineStart);
        const e = phase.end ? differenceInDays(parseISO(phase.end), timelineStart) : s + 3;
        const left = dayToPercent(s, totalDays);
        const width = dayToPercent(Math.max(e - s, 1), totalDays);
        const isActive = (phase as any).isActive === true;
        const isPast = (phase as any).isPast === true;
        const opacity = isActive ? 0.9 : isPast ? 0.55 : 0.18;
        const height = isActive ? 24 : 16;

        return (
          <TooltipProvider key={phase.key}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'absolute top-1/2 -translate-y-1/2 rounded-[4px] overflow-hidden transition-all',
                    isActive && 'shadow-[0_2px_8px_rgba(0,0,0,0.2)] ring-1 ring-white/20',
                    !isActive && 'hover:shadow-[0_1px_4px_rgba(0,0,0,0.15)]',
                  )}
                  style={{ left: `${left}%`, width: `${Math.max(width, 0.4)}%`, minWidth: 8, height }}
                >
                  <div className="absolute inset-0 rounded-[4px]" style={{ background: style?.gradient || phase.color, opacity }} />
                  {isActive && (
                    <span className="relative z-10 text-[9px] text-white font-semibold px-1.5 truncate block drop-shadow-sm" style={{ lineHeight: `${height}px` }}>
                      {phase.label}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent className="p-3" side="top">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: style?.color || phase.color }} />
                  <p className="text-xs font-semibold">{phase.label}</p>
                  {isActive && <span className="text-[9px] bg-primary/20 text-primary px-1.5 rounded-full font-medium">Active</span>}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {format(parseISO(phase.start), 'dd MMM yyyy')}
                  {phase.end ? ` → ${format(parseISO(phase.end), 'dd MMM yyyy')}` : ''}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </>
  );
}

/* ── Milestone dot (for tasks without end date) ── */
interface MilestoneDotProps {
  date: string;
  timelineStart: Date;
  totalDays: number;
  color: string;
}

export function GanttMilestoneDot({ date, timelineStart, totalDays, color }: MilestoneDotProps) {
  const left = dayToPercent(differenceInDays(parseISO(date), timelineStart), totalDays);
  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
      style={{ left: `${left}%` }}
    >
      <div
        className="w-3 h-3 rotate-45 rounded-[2px] ring-2 ring-background"
        style={{ background: color }}
      />
    </div>
  );
}
