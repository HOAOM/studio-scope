import { cn } from '@/lib/utils';
import { differenceInDays, parseISO, format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { GanttRow, PhaseSegment } from './types';
import { GROUP_COLORS, ITEM_PHASE_STYLES } from './constants';
import { dayToPercent } from './helpers';

// ─── Task Bar (for standalone tasks) ───

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
              'absolute top-1/2 -translate-y-1/2 rounded-[4px] overflow-hidden transition-all duration-150',
              isDragging ? 'shadow-[0_0_12px_rgba(var(--primary),0.3)] ring-1 ring-primary/40 scale-[1.02]' : 'hover:shadow-[0_2px_6px_rgba(0,0,0,0.25)]',
              'cursor-grab active:cursor-grabbing'
            )}
            style={{ left: `${barLeft}%`, width: `${barWidth}%`, minWidth: 10, height: 20 }}
            onMouseDown={(e) => onDragStart(e, 'move')}
          >
            <div className="absolute inset-0 rounded-[4px]" style={{ background: gc.barGradient, opacity: 0.2 }} />
            <div className="absolute inset-y-0 left-0 rounded-l-[4px]" style={{ width: `${row.progress}%`, background: gc.barGradient, opacity: 0.85 }} />
            <span className="relative z-10 text-[9px] text-foreground font-medium px-1.5 truncate block leading-[20px]">
              {row.label.replace('↳ ', '')}
            </span>
            <div className="absolute left-0 top-0 bottom-0 w-[5px] cursor-col-resize group/h" onMouseDown={(e) => { e.stopPropagation(); onDragStart(e, 'start'); }}>
              <div className="absolute inset-y-[4px] left-[1px] w-[2px] rounded-full bg-foreground/0 group-hover/h:bg-foreground/40 transition-colors" />
            </div>
            <div className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize group/h" onMouseDown={(e) => { e.stopPropagation(); onDragStart(e, 'end'); }}>
              <div className="absolute inset-y-[4px] right-[1px] w-[2px] rounded-full bg-foreground/0 group-hover/h:bg-foreground/40 transition-colors" />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-[220px] p-2.5" side="top">
          <p className="text-xs font-semibold">{row.label}</p>
          <p className="text-[10px] text-muted-foreground">
            {format(parseISO(displayStart), 'dd MMM yyyy')} → {format(parseISO(displayEnd), 'dd MMM yyyy')}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1 bg-muted/50 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${row.progress}%`, background: gc.barGradient }} />
            </div>
            <span className="text-[9px] font-mono text-muted-foreground">{row.progress}%</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Item Phase Bars (7-segment) ───

interface ItemPhaseBarsProps {
  row: GanttRow;
  timelineStart: Date;
  totalDays: number;
}

export function GanttItemPhaseBars({ row, timelineStart, totalDays }: ItemPhaseBarsProps) {
  if (!row.phases?.length) return null;

  return (
    <>
      {/* Connecting baseline outline */}
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
              opacity: 0.1,
            }}
          />
        );
      })()}

      {row.phases.map(phase => (
        <PhaseBar
          key={phase.key}
          phase={phase}
          timelineStart={timelineStart}
          totalDays={totalDays}
          isOnHold={row.isOnHold}
          isCancelled={row.isCancelled}
        />
      ))}
    </>
  );
}

// ─── Single Phase Bar ───

function PhaseBar({
  phase, timelineStart, totalDays, isOnHold, isCancelled
}: {
  phase: PhaseSegment;
  timelineStart: Date;
  totalDays: number;
  isOnHold?: boolean;
  isCancelled?: boolean;
}) {
  const style = ITEM_PHASE_STYLES[phase.key];
  const s = differenceInDays(parseISO(phase.start), timelineStart);
  const e = phase.end ? differenceInDays(parseISO(phase.end), timelineStart) : s + 3;
  const left = dayToPercent(s, totalDays);
  const width = dayToPercent(Math.max(e - s, 1), totalDays);
  
  const isActive = phase.isActive === true;
  const isPast = phase.isPast === true;
  const isFuture = phase.isFuture === true;
  
  // Visual rules per spec
  let opacity = isActive ? 1 : isPast ? 0.5 : 0.15;
  let height = isActive ? 26 : 16;
  
  if (isOnHold) {
    opacity = isActive ? 0.4 : isPast ? 0.35 : 0.08;
  }
  if (isCancelled && isFuture) return null;
  
  const hasDelay = phase.delayed;
  const hasAtRisk = phase.atRisk;
  const actualProgress = phase.actualProgress || 0;

  // Baseline outline dimensions
  const bsLeft = phase.baselineStart ? dayToPercent(differenceInDays(parseISO(phase.baselineStart), timelineStart), totalDays) : left;
  const bsEnd = phase.baselineEnd ? dayToPercent(differenceInDays(parseISO(phase.baselineEnd), timelineStart), totalDays) : left + width;
  const bsWidth = Math.max(bsEnd - bsLeft, 0.3);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `${left}%`, width: `${Math.max(width, 0.3)}%`, minWidth: 6 }}>
            {/* Baseline outline */}
            {phase.baselineStart && phase.baselineEnd && (
              <div
                className="absolute -translate-y-1/2 top-1/2 border border-dashed rounded-[3px] pointer-events-none"
                style={{
                  left: `${((bsLeft - left) / Math.max(width, 0.3)) * 100}%`,
                  width: `${(bsWidth / Math.max(width, 0.3)) * 100}%`,
                  height: height + 4,
                  borderColor: style?.color || phase.color,
                  opacity: 0.25,
                }}
              />
            )}

            {/* Main bar */}
            <div
              className={cn(
                'rounded-[3px] overflow-hidden transition-all relative',
                isActive && !hasDelay && !hasAtRisk && 'ring-1 ring-white/15 shadow-sm',
                hasDelay && 'ring-1 ring-destructive/50',
                hasAtRisk && !hasDelay && 'ring-1 ring-[hsl(var(--status-at-risk))]/40',
              )}
              style={{ height }}
            >
              {/* Background fill */}
              <div
                className="absolute inset-0 rounded-[3px]"
                style={{ background: style?.gradient || phase.color, opacity }}
              />
              
              {/* Actual progress line (thin bar inside) */}
              {isActive && (
                <div
                  className="absolute bottom-0 left-0 h-[3px] rounded-b-[3px]"
                  style={{
                    width: `${actualProgress * 100}%`,
                    background: style?.color || phase.color,
                    opacity: 1,
                  }}
                />
              )}

              {/* Gate dots */}
              {isActive && phase.gates && phase.gates.length > 0 && (
                <div className="absolute top-0.5 right-0.5 flex gap-px">
                  {phase.gates.map(g => (
                    <div
                      key={g.key}
                      className="w-[5px] h-[5px] rounded-full"
                      style={{
                        background: g.status === 'approved' ? 'hsl(var(--status-safe))' :
                                   g.status === 'overdue' ? 'hsl(var(--status-unsafe))' :
                                   'hsl(var(--muted-foreground))',
                        opacity: g.status === 'pending' ? 0.4 : 0.9,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Label - only on active phase */}
              {isActive && height >= 22 && (
                <span className="relative z-10 text-[8px] text-white font-semibold px-1 truncate block drop-shadow-sm" style={{ lineHeight: `${height}px` }}>
                  {phase.label}
                </span>
              )}
            </div>

            {/* Delay/at-risk indicator */}
            {hasDelay && (
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-destructive" />
            )}
            {hasAtRisk && !hasDelay && (
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[hsl(var(--status-at-risk))]" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent className="p-2.5 max-w-[240px]" side="top">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-sm" style={{ background: style?.color || phase.color }} />
            <p className="text-xs font-semibold">{phase.label}</p>
            {isActive && <span className="text-[8px] bg-primary/20 text-primary px-1 rounded-full font-medium">Active</span>}
            {hasDelay && <span className="text-[8px] bg-destructive/20 text-destructive px-1 rounded-full font-medium">Delayed</span>}
            {hasAtRisk && !hasDelay && <span className="text-[8px] bg-[hsl(var(--status-at-risk))]/20 text-[hsl(var(--status-at-risk))] px-1 rounded-full font-medium">At Risk</span>}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {format(parseISO(phase.start), 'dd MMM')} → {phase.end ? format(parseISO(phase.end), 'dd MMM') : '—'}
          </p>
          {phase.baselineEnd && (
            <p className="text-[9px] text-muted-foreground/60 mt-0.5">
              Baseline: {phase.baselineStart ? format(parseISO(phase.baselineStart), 'dd MMM') : '—'} → {format(parseISO(phase.baselineEnd), 'dd MMM')}
            </p>
          )}
          {isActive && (
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 h-1 bg-muted/40 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(phase.actualProgress || 0) * 100}%`, background: style?.color || phase.color }} />
              </div>
              <span className="text-[9px] font-mono text-muted-foreground">{Math.round((phase.actualProgress || 0) * 100)}%</span>
            </div>
          )}
          {phase.gates && phase.gates.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {phase.gates.map(g => (
                <div key={g.key} className="flex items-center gap-1.5 text-[9px]">
                  <div className="w-1.5 h-1.5 rounded-full" style={{
                    background: g.status === 'approved' ? 'hsl(var(--status-safe))' : g.status === 'overdue' ? 'hsl(var(--status-unsafe))' : 'hsl(var(--muted-foreground))',
                  }} />
                  <span className={cn(g.status === 'approved' ? 'text-[hsl(var(--status-safe))]' : 'text-muted-foreground')}>{g.label}</span>
                </div>
              ))}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Milestone dot ───

interface MilestoneDotProps {
  date: string;
  timelineStart: Date;
  totalDays: number;
  color: string;
}

export function GanttMilestoneDot({ date, timelineStart, totalDays, color }: MilestoneDotProps) {
  const left = dayToPercent(differenceInDays(parseISO(date), timelineStart), totalDays);
  return (
    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2" style={{ left: `${left}%` }}>
      <div className="w-2.5 h-2.5 rotate-45 rounded-[2px] ring-2 ring-background" style={{ background: color }} />
    </div>
  );
}
