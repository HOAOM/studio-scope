import { differenceInDays, parseISO, addDays, isBefore, isAfter, format, getDay, startOfMonth } from 'date-fns';
import { GanttRow, ProjectItem, ZoomLevel, TimelineColumn, TimelineMonthColumn } from './types';
import { MACRO_PHASES, getMacroPhase, addWorkingDays, TaskMacroArea } from '@/lib/workflow';
import { ITEM_PHASE_STYLES, GROUP_ORDER, PHASE_DURATIONS } from './constants';
import { ProjectTask } from '@/hooks/useTasks';

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

/** Maps lifecycle_status to the index of the active macro-phase (0-6) */
function getActivePhaseIndex(status: string | null): number {
  const phase = getMacroPhase(status as any);
  const order: TaskMacroArea[] = ['planning', 'design_validation', 'procurement', 'production', 'delivery', 'installation', 'closing'];
  const idx = order.indexOf(phase);
  return idx >= 0 ? idx : 0;
}

/** Compute 7 sequential phase bars for an item based on project start + default durations */
function computeItemPhases(item: ProjectItem, projectStartDate: string): GanttRow['phases'] {
  const phases: GanttRow['phases'] = [];
  const phaseOrder: TaskMacroArea[] = ['planning', 'design_validation', 'procurement', 'production', 'delivery', 'installation', 'closing'];
  const activeIdx = getActivePhaseIndex(item.lifecycle_status);
  
  let cursor = parseISO(projectStartDate);
  
  for (let i = 0; i < phaseOrder.length; i++) {
    const phaseKey = phaseOrder[i];
    const duration = PHASE_DURATIONS[phaseKey];
    const phaseEnd = addWorkingDays(cursor, duration);
    const style = ITEM_PHASE_STYLES[phaseKey];
    
    const isActive = i === activeIdx;
    const isPast = i < activeIdx;
    const isFuture = i > activeIdx;
    
    phases.push({
      key: phaseKey,
      label: style?.label || phaseKey,
      color: style?.color || 'hsl(0,0%,65%)',
      start: format(cursor, 'yyyy-MM-dd'),
      end: format(phaseEnd, 'yyyy-MM-dd'),
      isActive,
      isPast,
      isFuture,
    });
    
    cursor = phaseEnd;
  }
  
  return phases;
}

/** Check if an item is delayed: if today is past the expected end of the active phase */
function isItemDelayed(phases: GanttRow['phases']): boolean {
  if (!phases) return false;
  const activePhase = phases.find((p: any) => p.isActive);
  if (!activePhase || !activePhase.end) return false;
  return isAfter(new Date(), parseISO(activePhase.end));
}

export function itemsToRows(
  items: ProjectItem[],
  projectStartDate?: string,
  projectEndDate?: string,
  linkedTasks?: ProjectTask[],
): GanttRow[] {
  const pStart = projectStartDate || format(new Date(), 'yyyy-MM-dd');
  
  return items
    .filter(item => {
      if (item.is_active === false) return false;
      if (item.lifecycle_status === 'cancelled' || item.lifecycle_status === 'on_hold') return false;
      if (item.parent_item_id && !item.is_selected_option) return false;
      return true;
    })
    .map(item => {
      const phases = computeItemPhases(item, pStart);
      const macroPhase = getMacroPhase(item.lifecycle_status as any);
      const delayed = isItemDelayed(phases);
      
      // Check for incomplete linked tasks that block cascade
      const itemTasks = (linkedTasks || []).filter(t => t.linked_item_id === item.id);
      const hasBlockingTask = itemTasks.some(t => t.status !== 'done');
      
      // If there's a blocking task, shift all phases after the active one
      let adjustedPhases = phases;
      if (hasBlockingTask && phases) {
        const blockingTask = itemTasks.find(t => t.status !== 'done' && t.end_date);
        if (blockingTask?.end_date) {
          const activeIdx = phases.findIndex(p => p.isActive);
          if (activeIdx >= 0) {
            const taskEnd = parseISO(blockingTask.end_date);
            const phaseEnd = phases[activeIdx].end ? parseISO(phases[activeIdx].end!) : null;
            if (phaseEnd && isAfter(taskEnd, phaseEnd)) {
              // Shift subsequent phases
              let cursor = taskEnd;
              adjustedPhases = phases.map((p, i) => {
                if (i <= activeIdx) return p;
                const duration = PHASE_DURATIONS[p.key as TaskMacroArea] || 5;
                const newEnd = addWorkingDays(cursor, duration);
                const shifted = { ...p, start: format(cursor, 'yyyy-MM-dd'), end: format(newEnd, 'yyyy-MM-dd') };
                cursor = newEnd;
                return shifted;
              });
            }
          }
        }
      }
      
      const startDate = adjustedPhases?.[0]?.start || null;
      const endDate = adjustedPhases?.[adjustedPhases.length - 1]?.end || null;

      return {
        id: `item-${item.id}`,
        type: 'item' as const,
        label: item.item_code || item.description.slice(0, 30),
        sublabel: item.description,
        group: macroPhase,
        status: item.lifecycle_status || 'draft',
        startDate,
        endDate,
        progress: calcItemProgress(item),
        phases: adjustedPhases,
        itemId: item.id,
        delayed: delayed || hasBlockingTask,
      };
    })
    .flatMap(itemRow => {
      const itemTasks = (linkedTasks || []).filter(t => t.linked_item_id === itemRow.itemId);
      const subTaskRows: GanttRow[] = itemTasks.map(t => ({
        id: t.id,
        type: 'task' as const,
        label: `↳ ${t.title}`,
        sublabel: t.description || undefined,
        group: itemRow.group,
        status: t.status,
        assignee: t.assignee_id || undefined,
        startDate: t.start_date,
        endDate: t.end_date,
        progress: calcTaskProgress(t),
        dependsOn: t.depends_on || undefined,
        task: t,
        isSubTask: true,
        parentItemId: itemRow.itemId,
        urgent: t.status !== 'done',
      }));
      return [itemRow, ...subTaskRows];
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

export function computeMonthColumns(timelineStart: Date, timelineEnd: Date, totalDays: number): TimelineMonthColumn[] {
  const cols: TimelineMonthColumn[] = [];
  let cursor = startOfMonth(timelineStart);
  if (isBefore(cursor, timelineStart)) {
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
