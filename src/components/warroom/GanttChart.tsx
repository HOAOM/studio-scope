import { useMemo, useState } from 'react';
import { Database } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { differenceInDays, parseISO, format, addDays, startOfWeek, endOfWeek, isWithinInterval, isBefore, isAfter } from 'date-fns';
import { ChevronLeft, ChevronRight, Flag, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];

interface Milestone {
  id: string;
  label: string;
  date: string;
  color?: string;
}

interface GanttChartProps {
  items: ProjectItem[];
  projectStartDate: string;
  projectEndDate: string;
  milestones?: Milestone[];
}

type DateField = 'production_due_date' | 'delivery_date' | 'received_date' | 'site_movement_date' | 'installation_start_date' | 'installed_date';

const PHASES: { key: DateField; endKey?: DateField; label: string; colorClass: string }[] = [
  { key: 'production_due_date', endKey: 'delivery_date', label: 'Production', colorClass: 'bg-blue-500/70' },
  { key: 'delivery_date', endKey: 'received_date', label: 'Delivery', colorClass: 'bg-amber-500/70' },
  { key: 'site_movement_date', endKey: 'installation_start_date', label: 'Site Move', colorClass: 'bg-purple-500/70' },
  { key: 'installation_start_date', endKey: 'installed_date', label: 'Installation', colorClass: 'bg-emerald-500/70' },
];

type ZoomLevel = 'week' | 'month' | 'quarter';

export function GanttChart({ items, projectStartDate, projectEndDate, milestones = [] }: GanttChartProps) {
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const [scrollOffset, setScrollOffset] = useState(0);

  // Compute timeline range
  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    let earliest = parseISO(projectStartDate);
    let latest = parseISO(projectEndDate);

    items.forEach(item => {
      PHASES.forEach(phase => {
        const d = item[phase.key] as string | null;
        const dEnd = phase.endKey ? (item[phase.endKey] as string | null) : null;
        if (d) {
          const parsed = parseISO(d);
          if (isBefore(parsed, earliest)) earliest = parsed;
          if (isAfter(parsed, latest)) latest = parsed;
        }
        if (dEnd) {
          const parsed = parseISO(dEnd);
          if (isAfter(parsed, latest)) latest = parsed;
        }
      });
    });

    // Add padding
    const start = addDays(earliest, -7);
    const end = addDays(latest, 14);
    return { timelineStart: start, timelineEnd: end, totalDays: differenceInDays(end, start) };
  }, [items, projectStartDate, projectEndDate]);

  // Items with at least one date
  const ganttItems = useMemo(() => {
    return items
      .filter(item => PHASES.some(p => item[p.key]))
      .sort((a, b) => {
        const aFirst = PHASES.map(p => a[p.key] as string | null).filter(Boolean)[0] || '';
        const bFirst = PHASES.map(p => b[p.key] as string | null).filter(Boolean)[0] || '';
        return aFirst.localeCompare(bFirst);
      });
  }, [items]);

  // Column headers
  const columns = useMemo(() => {
    const cols: { label: string; startDay: number; widthDays: number }[] = [];
    let cursor = timelineStart;

    while (isBefore(cursor, timelineEnd)) {
      let label: string;
      let nextCursor: Date;

      if (zoom === 'week') {
        label = format(cursor, 'dd MMM');
        nextCursor = addDays(cursor, 7);
      } else if (zoom === 'month') {
        label = format(cursor, 'MMM yyyy');
        const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        nextCursor = nextMonth;
      } else {
        const q = Math.floor(cursor.getMonth() / 3) + 1;
        label = `Q${q} ${cursor.getFullYear()}`;
        const nextQ = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1);
        nextCursor = nextQ;
      }

      const startDay = differenceInDays(cursor, timelineStart);
      const widthDays = Math.min(differenceInDays(nextCursor, cursor), totalDays - startDay);

      if (widthDays > 0) {
        cols.push({ label, startDay, widthDays });
      }
      cursor = nextCursor;
    }
    return cols;
  }, [timelineStart, timelineEnd, totalDays, zoom]);

  const dayToPercent = (day: number) => (day / totalDays) * 100;

  const getBarPosition = (startDate: string | null, endDate: string | null) => {
    if (!startDate) return null;
    const start = differenceInDays(parseISO(startDate), timelineStart);
    const end = endDate
      ? differenceInDays(parseISO(endDate), timelineStart)
      : start + 3; // minimum 3-day width for dots
    const width = Math.max(end - start, 1);
    return { left: dayToPercent(start), width: dayToPercent(width) };
  };

  // Today marker
  const todayOffset = differenceInDays(new Date(), timelineStart);
  const todayPercent = dayToPercent(todayOffset);

  if (ganttItems.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">No items with dates to display on the Gantt chart. Add production/delivery/installation dates to items to see the timeline.</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-elevated">
        <div>
          <h3 className="font-semibold text-foreground">Project Timeline</h3>
          <p className="text-xs text-muted-foreground">{ganttItems.length} items with dates</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {PHASES.map(p => (
              <span key={p.key} className="flex items-center gap-1 mr-3">
                <span className={cn('w-3 h-2 rounded-sm', p.colorClass)} />
                {p.label}
              </span>
            ))}
            <span className="flex items-center gap-1 mr-3">
              <Flag className="w-3 h-3 text-red-500" />
              Milestone
            </span>
          </div>
          <div className="flex items-center border border-border rounded-md">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setZoom(z => z === 'quarter' ? 'month' : 'week')}>
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs px-2 border-x border-border text-muted-foreground min-w-[50px] text-center">{zoom}</span>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setZoom(z => z === 'week' ? 'month' : 'quarter')}>
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Column headers */}
          <div className="flex border-b border-border bg-muted/30">
            <div className="w-48 min-w-48 px-3 py-2 border-r border-border text-xs font-medium text-muted-foreground">
              Item
            </div>
            <div className="flex-1 relative h-8">
              {columns.map((col, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full flex items-center border-r border-border/50 px-1"
                  style={{ left: `${dayToPercent(col.startDay)}%`, width: `${dayToPercent(col.widthDays)}%` }}
                >
                  <span className="text-[10px] text-muted-foreground truncate">{col.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div className="relative">
            {/* Today line */}
            {todayPercent >= 0 && todayPercent <= 100 && (
              <div
                className="absolute top-0 bottom-0 w-px bg-red-500/60 z-10"
                style={{ left: `calc(192px + (100% - 192px) * ${todayPercent / 100})` }}
              >
                <span className="absolute -top-0 -translate-x-1/2 text-[9px] bg-red-500 text-white px-1 rounded-b">Today</span>
              </div>
            )}

            {/* Milestone markers */}
            {milestones.map(m => {
              const mDay = differenceInDays(parseISO(m.date), timelineStart);
              const mPercent = dayToPercent(mDay);
              if (mPercent < 0 || mPercent > 100) return null;
              return (
                <TooltipProvider key={m.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="absolute top-0 bottom-0 w-px bg-red-400/40 z-10 cursor-pointer"
                        style={{ left: `calc(192px + (100% - 192px) * ${mPercent / 100})` }}
                      >
                        <Flag className="w-3 h-3 text-red-500 absolute -top-0 -translate-x-1/2" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent><p className="text-xs">{m.label} — {format(parseISO(m.date), 'dd MMM yyyy')}</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}

            {ganttItems.map((item, idx) => (
              <div
                key={item.id}
                className={cn(
                  'flex items-center border-b border-border/50 hover:bg-muted/20 transition-colors',
                  idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/10'
                )}
                style={{ height: 32 }}
              >
                {/* Label */}
                <div className="w-48 min-w-48 px-3 border-r border-border">
                  <p className="text-[11px] text-foreground truncate" title={item.description}>
                    {item.item_code ? (
                      <span className="font-mono text-primary mr-1">{item.item_code}</span>
                    ) : null}
                    {item.description}
                  </p>
                </div>

                {/* Bars */}
                <div className="flex-1 relative h-full">
                  {PHASES.map(phase => {
                    const startVal = item[phase.key] as string | null;
                    const endVal = phase.endKey ? (item[phase.endKey] as string | null) : null;
                    const pos = getBarPosition(startVal, endVal);
                    if (!pos) return null;

                    return (
                      <TooltipProvider key={phase.key}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={cn('absolute top-1/2 -translate-y-1/2 h-4 rounded-sm cursor-pointer', phase.colorClass)}
                              style={{ left: `${pos.left}%`, width: `${Math.max(pos.width, 0.3)}%`, minWidth: 4 }}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs font-medium">{phase.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {startVal ? format(parseISO(startVal), 'dd MMM yyyy') : '?'}
                              {endVal ? ` → ${format(parseISO(endVal), 'dd MMM yyyy')}` : ''}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
