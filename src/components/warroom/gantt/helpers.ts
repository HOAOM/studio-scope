import { differenceInDays, parseISO, addDays, isBefore, isAfter, format, getDay, startOfMonth } from 'date-fns';
import { GanttRow, ProjectItem, ZoomLevel, TimelineColumn, TimelineMonthColumn } from './types';
import { MACRO_PHASES, getMacroPhase } from '@/lib/workflow';
import { ProjectTask } from '@/hooks/useTasks';
import { ITEM_PHASE_STYLES, GROUP_ORDER } from './constants';
import { getMacroPhase } from '@/lib/workflow';

export function calcTaskProgress(task: ProjectTask): number {
  if (task.status === 'done') return 100;
  if (task.status === 'todo' || task.status === 'blocked') return 0;
  if (task.start_date && task.end_date) {
    const total = differenceInDays(parseISO(task.end_date), parseISO(task.start_date));
    const elapsed = differenceInDays(new Date(), parseISO(task.start_date));
    if (total <= 0) return 50;
    return Math.min(Math.max(Math.round((elapsed / total) * 100), 5), 95);
  }
  return 50;
}

export function calcItemProgress(item: ProjectItem): number {
  const stages = [
    item.lifecycle_status === 'installed',
    item.installed,
    item.received,
    item.purchased,
    item.approval_status === 'approved',
    item.boq_included,
  ];
  return Math.round((stages.filter(Boolean).length / stages.length) * 100);
}

export function itemsToRows(items: ProjectItem[]): GanttRow[] {
  return items
    .filter(item => {
      // Only show active items and selected options (or items without parent)
      if (item.is_active === false) return false;
      if (item.lifecycle_status === 'cancelled' || item.lifecycle_status === 'on_hold') return false;
      if (item.parent_item_id && !item.is_selected_option) return false;
      return item.production_due_date || item.delivery_date || item.site_movement_date || item.installation_start_date || item.installed_date;
    })
    .map(item => {
      const phases: GanttRow['phases'] = [];
      if (item.production_due_date)
        phases.push({ key: 'production', label: ITEM_PHASE_STYLES.production.label, color: ITEM_PHASE_STYLES.production.color, start: item.production_due_date, end: item.delivery_date });
      if (item.delivery_date)
        phases.push({ key: 'transit', label: ITEM_PHASE_STYLES.transit.label, color: ITEM_PHASE_STYLES.transit.color, start: item.delivery_date, end: item.received_date || item.site_movement_date });
      if (item.site_movement_date)
        phases.push({ key: 'site', label: ITEM_PHASE_STYLES.site.label, color: ITEM_PHASE_STYLES.site.color, start: item.site_movement_date, end: item.installation_start_date });
      if (item.installation_start_date)
        phases.push({ key: 'install', label: ITEM_PHASE_STYLES.install.label, color: ITEM_PHASE_STYLES.install.color, start: item.installation_start_date, end: item.installed_date });

      const allDates = [item.production_due_date, item.delivery_date, item.received_date, item.site_movement_date, item.installation_start_date, item.installed_date].filter(Boolean) as string[];
      allDates.sort();

      // Group by workflow macro-phase instead of BOQ category
      const macroPhase = getMacroPhase(item.lifecycle_status as any);

      return {
        id: `item-${item.id}`,
        type: 'item' as const,
        label: item.item_code || item.description.slice(0, 30),
        sublabel: item.description,
        group: macroPhase,
        status: item.lifecycle_status || 'draft',
        startDate: allDates[0] || null,
        endDate: allDates[allDates.length - 1] || null,
        progress: calcItemProgress(item),
        phases,
      };
    });
}

export function computeTimelineRange(rows: GanttRow[], projectStartDate: string, projectEndDate: string) {
  let earliest = parseISO(projectStartDate);
  let latest = parseISO(projectEndDate);
  rows.forEach(r => {
    if (r.startDate) { const d = parseISO(r.startDate); if (isBefore(d, earliest)) earliest = d; }
    if (r.endDate) { const d = parseISO(r.endDate); if (isAfter(d, latest)) latest = d; }
    r.phases?.forEach(p => {
      const d1 = parseISO(p.start);
      if (isBefore(d1, earliest)) earliest = d1;
      if (p.end) { const d2 = parseISO(p.end); if (isAfter(d2, latest)) latest = d2; }
    });
  });
  const start = addDays(earliest, -7);
  const end = addDays(latest, 14);
  return { timelineStart: start, timelineEnd: end, totalDays: differenceInDays(end, start) };
}

export function computeColumns(timelineStart: Date, timelineEnd: Date, totalDays: number, zoom: ZoomLevel): TimelineColumn[] {
  const cols: TimelineColumn[] = [];
  let cursor = timelineStart;
  while (isBefore(cursor, timelineEnd)) {
    let label: string, sub: string | undefined, nextCursor: Date;
    if (zoom === 'day') {
      label = format(cursor, 'dd');
      sub = format(cursor, 'EEE');
      nextCursor = addDays(cursor, 1);
    } else if (zoom === 'week') {
      label = format(cursor, 'dd MMM');
      nextCursor = addDays(cursor, 7);
    } else {
      label = format(cursor, 'MMM yyyy');
      nextCursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    const startDay = differenceInDays(cursor, timelineStart);
    const widthDays = Math.min(differenceInDays(nextCursor, cursor), totalDays - startDay);
    const isWeekend = zoom === 'day' && (getDay(cursor) === 0 || getDay(cursor) === 6);
    if (widthDays > 0) cols.push({ label, sub, startDay, widthDays, isWeekend });
    cursor = nextCursor;
  }
  return cols;
}

/** Compute month-level header row for the dual-row calendar */
export function computeMonthColumns(timelineStart: Date, timelineEnd: Date, totalDays: number): TimelineMonthColumn[] {
  const cols: TimelineMonthColumn[] = [];
  // Start from the first day of the month containing timelineStart
  let cursor = startOfMonth(timelineStart);
  if (isBefore(cursor, timelineStart)) {
    // The first month column starts at timelineStart, not before
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const startDay = 0;
    const endDay = Math.min(differenceInDays(nextMonth, timelineStart), totalDays);
    if (endDay > 0) {
      cols.push({ label: format(timelineStart, 'MMM yyyy'), startDay, widthDays: endDay });
    }
    cursor = nextMonth;
  }
  while (isBefore(cursor, timelineEnd)) {
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const startDay = differenceInDays(cursor, timelineStart);
    const widthDays = Math.min(differenceInDays(nextMonth, cursor), totalDays - startDay);
    if (widthDays > 0) {
      cols.push({ label: format(cursor, 'MMM yyyy'), startDay, widthDays });
    }
    cursor = nextMonth;
  }
  return cols;
}

export function groupRows(rows: GanttRow[]) {
  const groups: Record<string, GanttRow[]> = {};
  rows.forEach(r => {
    if (!groups[r.group]) groups[r.group] = [];
    groups[r.group].push(r);
  });
  const sorted: { group: string; rows: GanttRow[] }[] = [];
  GROUP_ORDER.forEach(g => {
    if (groups[g]?.length) sorted.push({ group: g, rows: groups[g] });
  });
  Object.keys(groups).forEach(g => {
    if (!GROUP_ORDER.includes(g) && groups[g].length) sorted.push({ group: g, rows: groups[g] });
  });
  return sorted;
}

export function dayToPercent(day: number, totalDays: number) {
  return (day / totalDays) * 100;
}
