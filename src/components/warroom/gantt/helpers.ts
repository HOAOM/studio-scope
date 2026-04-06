import { differenceInDays, parseISO, addDays, isBefore, isAfter, format, getDay, startOfMonth } from 'date-fns';
import { GanttRow, ProjectItem, ZoomLevel, TimelineColumn, TimelineMonthColumn, PhaseSegment, GateMarker, ItemTag } from './types';
import { MACRO_PHASES, getMacroPhase, addWorkingDays, TaskMacroArea, LIFECYCLE_ORDER, getLifecycleIndex } from '@/lib/workflow';
import { ITEM_PHASE_STYLES, GROUP_ORDER, PHASE_DURATIONS, PHASE_GATES, WAITING_CLIENT_STATUSES, WAITING_SUPPLIER_STATUSES } from './constants';
import { ProjectTask } from '@/hooks/useTasks';

// ─── Progress Calculations ───

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
  const idx = getLifecycleIndex(item.lifecycle_status as any);
  const total = LIFECYCLE_ORDER.length;
  if (idx < 0) return 0;
  return Math.round((idx / total) * 100);
}

// ─── Phase Index ───

function getActivePhaseIndex(status: string | null): number {
  const phase = getMacroPhase(status as any);
  const order: TaskMacroArea[] = ['planning', 'design_validation', 'procurement', 'production', 'delivery', 'installation', 'closing'];
  const idx = order.indexOf(phase);
  return idx >= 0 ? idx : 0;
}

// ─── Gate Computation ───

function computeGatesForPhase(phaseKey: string, lifecycleStatus: string | null): GateMarker[] {
  const gateDefs = PHASE_GATES[phaseKey];
  if (!gateDefs) return [];
  
  const currentIdx = getLifecycleIndex(lifecycleStatus as any);
  
  return gateDefs.map(g => {
    // Check if item has reached any of the required statuses
    const isApproved = g.requiredStatuses.some(s => {
      const requiredIdx = getLifecycleIndex(s as any);
      return currentIdx >= requiredIdx;
    });
    
    if (isApproved) return { key: g.key, label: g.label, status: 'approved' as const };
    return { key: g.key, label: g.label, status: 'pending' as const };
  });
}

// ─── At-Risk / Delayed ───

function computePhaseRisk(phaseStart: string, phaseEnd: string | null, isActive: boolean, isPast: boolean): { atRisk: boolean; delayed: boolean } {
  if (!phaseEnd) return { atRisk: false, delayed: false };
  
  const now = new Date();
  const end = parseISO(phaseEnd);
  const start = parseISO(phaseStart);
  
  // If phase should be past (based on baseline) but item is still active here → delayed
  if (isPast) return { atRisk: false, delayed: false };
  
  if (isActive) {
    const totalDuration = differenceInDays(end, start);
    const elapsed = differenceInDays(now, start);
    if (isAfter(now, end)) return { atRisk: false, delayed: true };
    if (totalDuration > 0 && elapsed / totalDuration >= 0.9) return { atRisk: true, delayed: false };
  }
  
  return { atRisk: false, delayed: false };
}

// ─── Actual Progress ───

function computeActualProgress(phaseKey: string, lifecycleStatus: string | null, phaseIndex: number, activeIndex: number): number {
  if (phaseIndex < activeIndex) return 1; // Past phase = complete
  if (phaseIndex > activeIndex) return 0; // Future phase = 0
  
  // Active phase: compute sub-progress based on lifecycle states within the phase
  const macroPhase = MACRO_PHASES.find(m => m.key === phaseKey);
  if (!macroPhase || !lifecycleStatus) return 0.5;
  
  const statesInPhase = macroPhase.states;
  const stateIdx = statesInPhase.indexOf(lifecycleStatus as any);
  if (stateIdx < 0) return 0.5;
  return Math.min((stateIdx + 1) / statesInPhase.length, 1);
}

// ─── Build Phases ───

function computeItemPhases(
  item: ProjectItem,
  projectStartDate: string,
  linkedTasks: ProjectTask[],
): PhaseSegment[] {
  const phases: PhaseSegment[] = [];
  const phaseOrder: TaskMacroArea[] = ['planning', 'design_validation', 'procurement', 'production', 'delivery', 'installation', 'closing'];
  const activeIdx = getActivePhaseIndex(item.lifecycle_status);
  const isCancelled = item.lifecycle_status === 'cancelled';
  const isOnHold = item.lifecycle_status === 'on_hold';
  
  let cursor = parseISO(projectStartDate);
  // Baseline cursor for original plan
  let baselineCursor = parseISO(projectStartDate);
  
  // Check for blocking tasks that shift phases
  const itemTasks = linkedTasks.filter(t => t.linked_item_id === item.id);
  
  for (let i = 0; i < phaseOrder.length; i++) {
    const phaseKey = phaseOrder[i];
    const duration = PHASE_DURATIONS[phaseKey];
    
    // Baseline (original plan)
    const baselineEnd = addWorkingDays(baselineCursor, duration);
    const baselineStartStr = format(baselineCursor, 'yyyy-MM-dd');
    const baselineEndStr = format(baselineEnd, 'yyyy-MM-dd');
    baselineCursor = baselineEnd;
    
    // For cancelled items, don't show future phases
    if (isCancelled && i > activeIdx) continue;
    
    // Forecast (adjusted for blocking tasks)
    let phaseEnd = addWorkingDays(cursor, duration);
    
    // Check if blocking tasks in this phase push the end date
    if (i === activeIdx) {
      const blockingTasks = itemTasks.filter(t => t.status !== 'done' && t.end_date);
      blockingTasks.forEach(t => {
        if (t.end_date) {
          const taskEnd = parseISO(t.end_date);
          if (isAfter(taskEnd, phaseEnd)) {
            phaseEnd = taskEnd;
          }
        }
      });
    }
    
    const style = ITEM_PHASE_STYLES[phaseKey];
    const isActive = i === activeIdx && !isCancelled;
    const isPast = i < activeIdx;
    const isFuture = i > activeIdx;
    
    // Check if this phase's baseline end is past → item should have been beyond this phase
    const baselinePast = isBefore(baselineEnd, new Date());
    const isDelayedPhase = isActive && baselinePast; // active but baseline says should be done
    
    const risk = computePhaseRisk(format(cursor, 'yyyy-MM-dd'), format(phaseEnd, 'yyyy-MM-dd'), isActive, isPast);
    const actualProgress = computeActualProgress(phaseKey, item.lifecycle_status, i, activeIdx);
    const gates = computeGatesForPhase(phaseKey, item.lifecycle_status);
    
    phases.push({
      key: phaseKey,
      label: style?.label || phaseKey,
      color: style?.color || 'hsl(0,0%,65%)',
      start: format(cursor, 'yyyy-MM-dd'),
      end: format(phaseEnd, 'yyyy-MM-dd'),
      isActive: isActive && !isOnHold,
      isPast,
      isFuture: isFuture || isOnHold,
      baselineStart: baselineStartStr,
      baselineEnd: baselineEndStr,
      actualProgress,
      gates: gates.length > 0 ? gates : undefined,
      atRisk: risk.atRisk,
      delayed: risk.delayed || isDelayedPhase,
    });
    
    cursor = phaseEnd;
  }
  
  return phases;
}

// ─── Derive waiting_for ───

function deriveWaitingFor(status: string | null): 'client' | 'supplier' | null {
  if (!status) return null;
  if (WAITING_CLIENT_STATUSES.has(status)) return 'client';
  if (WAITING_SUPPLIER_STATUSES.has(status)) return 'supplier';
  return null;
}

// ─── Derive tags ───

function deriveItemTags(item: ProjectItem, phases: PhaseSegment[], hasOptions: boolean): ItemTag[] {
  const tags: ItemTag[] = [];
  
  if (item.lifecycle_status === 'on_hold') tags.push('on_hold');
  if (item.lifecycle_status === 'cancelled') tags.push('cancelled');
  if ((item.revision_number || 1) > 1) tags.push('revision');
  if (hasOptions) tags.push('options');
  
  // Check phases for delay/at-risk
  const hasDelay = phases.some(p => p.delayed);
  const hasAtRisk = phases.some(p => p.atRisk);
  if (hasDelay) tags.push('delayed');
  else if (hasAtRisk) tags.push('at_risk');
  
  return tags;
}

// ─── Item → GanttRow ───

export function itemsToRows(
  items: ProjectItem[],
  projectStartDate?: string,
  projectEndDate?: string,
  linkedTasks?: ProjectTask[],
): GanttRow[] {
  const pStart = projectStartDate || format(new Date(), 'yyyy-MM-dd');
  const allTasks = linkedTasks || [];
  
  // Sort items by item_code (contains floor/room/item info)
  const sortedItems = [...items]
    .filter(item => {
      if (item.is_active === false && item.lifecycle_status !== 'cancelled') return false;
      if (item.parent_item_id && !item.is_selected_option) return false;
      return true;
    })
    .sort((a, b) => {
      const codeA = a.item_code || '';
      const codeB = b.item_code || '';
      return codeA.localeCompare(codeB);
    });
  
  return sortedItems
    .map(item => {
      const phases = computeItemPhases(item, pStart, allTasks);
      const macroPhase = getMacroPhase(item.lifecycle_status as any);
      const itemTasks = allTasks.filter(t => t.linked_item_id === item.id);
      const openTasks = itemTasks.filter(t => t.status !== 'done');
      
      // Check if item has unselected options
      const hasOptions = items.some(other => other.parent_item_id === item.id);
      
      const tags = deriveItemTags(item, phases, hasOptions);
      const isDelayed = tags.includes('delayed');
      const isAtRisk = tags.includes('at_risk');
      
      const startDate = phases[0]?.start || null;
      const endDate = phases[phases.length - 1]?.end || null;

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
        phases,
        itemId: item.id,
        delayed: isDelayed,
        atRisk: isAtRisk,
        tags,
        revisionNumber: item.revision_number || 1,
        hasOptions,
        isOnHold: item.lifecycle_status === 'on_hold',
        isCancelled: item.lifecycle_status === 'cancelled',
        waitingFor: deriveWaitingFor(item.lifecycle_status),
        taskCount: itemTasks.length,
        openTaskCount: openTasks.length,
        category: item.category,
      };
    })
    .flatMap(itemRow => {
      const itemTasks = allTasks.filter(t => t.linked_item_id === itemRow.itemId);
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

// ─── Timeline Computation ───

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
    const endDay = Math.min(differenceInDays(nextMonth, timelineStart), totalDays);
    if (endDay > 0) cols.push({ label: format(timelineStart, 'MMM yyyy'), startDay: 0, widthDays: endDay });
    cursor = nextMonth;
  }
  while (isBefore(cursor, timelineEnd)) {
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const startDay = differenceInDays(cursor, timelineStart);
    const widthDays = Math.min(differenceInDays(nextMonth, cursor), totalDays - startDay);
    if (widthDays > 0) cols.push({ label: format(cursor, 'MMM yyyy'), startDay, widthDays });
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
