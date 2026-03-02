import { useMemo, useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { differenceInDays, parseISO, format, addDays, isBefore, isAfter } from 'date-fns';
import { Plus, ZoomIn, ZoomOut, Edit, Trash2, ChevronDown, ChevronRight, Package, GripVertical, Wand2, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { useProjectTasks, useDeleteTask, useUpdateTask, ProjectTask } from '@/hooks/useTasks';
import { useTaskTemplate } from '@/hooks/useTaskTemplate';
import { TaskFormDialog } from './TaskFormDialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Database } from '@/integrations/supabase/types';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];

/* ── Unified row type ── */
interface GanttRow {
  id: string;
  type: 'task' | 'item';
  label: string;
  sublabel?: string;
  group: string;
  status: string;
  assignee?: string;
  startDate: string | null;
  endDate: string | null;
  progress: number; // 0-100
  dependsOn?: string; // task id this depends on
  phases?: { key: string; label: string; color: string; start: string; end: string | null }[];
  task?: ProjectTask;
}

/* ── Constants ── */
const GROUP_ORDER = ['planning', 'design_validation', 'procurement', 'production', 'delivery', 'installation', 'closing', 'custom', 'items_joinery', 'items_loose-furniture', 'items_lighting', 'items_finishes', 'items_ffe', 'items_accessories', 'items_appliances'];

const GROUP_LABELS: Record<string, string> = {
  planning: '📋 Planning & Prep',
  design_validation: '🎨 Design Validation',
  procurement: '🛒 Procurement',
  production: '🏭 Production',
  delivery: '🚚 Delivery',
  installation: '🔧 Installation',
  closing: '✅ Closing',
  custom: '📌 Custom',
  items_joinery: '🪵 Joinery',
  'items_loose-furniture': '🛋️ Loose Furniture',
  items_lighting: '💡 Lighting',
  items_finishes: '🎨 Finishes',
  items_ffe: '🏠 FF&E',
  items_accessories: '✨ Accessories',
  items_appliances: '⚡ Appliances',
};

const GROUP_COLORS: Record<string, { bar: string; bg: string }> = {
  planning: { bar: 'bg-blue-500', bg: 'bg-blue-500/10' },
  design_validation: { bar: 'bg-cyan-500', bg: 'bg-cyan-500/10' },
  procurement: { bar: 'bg-amber-500', bg: 'bg-amber-500/10' },
  production: { bar: 'bg-indigo-500', bg: 'bg-indigo-500/10' },
  delivery: { bar: 'bg-purple-500', bg: 'bg-purple-500/10' },
  installation: { bar: 'bg-emerald-500', bg: 'bg-emerald-500/10' },
  closing: { bar: 'bg-rose-500', bg: 'bg-rose-500/10' },
  custom: { bar: 'bg-slate-500', bg: 'bg-slate-500/10' },
  items_joinery: { bar: 'bg-orange-500', bg: 'bg-orange-500/10' },
  'items_loose-furniture': { bar: 'bg-teal-500', bg: 'bg-teal-500/10' },
  items_lighting: { bar: 'bg-yellow-500', bg: 'bg-yellow-500/10' },
  items_finishes: { bar: 'bg-pink-500', bg: 'bg-pink-500/10' },
  items_ffe: { bar: 'bg-lime-500', bg: 'bg-lime-500/10' },
  items_accessories: { bar: 'bg-sky-500', bg: 'bg-sky-500/10' },
  items_appliances: { bar: 'bg-red-500', bg: 'bg-red-500/10' },
};

const ITEM_PHASE_COLORS: Record<string, { bar: string; label: string }> = {
  production: { bar: 'bg-indigo-500', label: 'Production' },
  transit: { bar: 'bg-amber-500', label: 'Transit' },
  site: { bar: 'bg-purple-500', label: 'Site' },
  install: { bar: 'bg-emerald-500', label: 'Install' },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  todo: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'To Do', dot: 'bg-muted-foreground' },
  in_progress: { bg: 'bg-primary/10', text: 'text-primary', label: 'In Progress', dot: 'bg-primary' },
  done: { bg: 'bg-status-safe-bg', text: 'text-status-safe', label: 'Done', dot: 'bg-[hsl(var(--status-safe))]' },
  blocked: { bg: 'bg-status-unsafe-bg', text: 'text-status-unsafe', label: 'Blocked', dot: 'bg-[hsl(var(--status-unsafe))]' },
  draft: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Draft', dot: 'bg-muted-foreground' },
  estimated: { bg: 'bg-status-at-risk-bg', text: 'text-status-at-risk', label: 'Estimated', dot: 'bg-[hsl(var(--status-at-risk))]' },
  approved: { bg: 'bg-status-safe-bg', text: 'text-status-safe', label: 'Approved', dot: 'bg-[hsl(var(--status-safe))]' },
  ordered: { bg: 'bg-primary/10', text: 'text-primary', label: 'Ordered', dot: 'bg-primary' },
  delivered: { bg: 'bg-status-safe-bg', text: 'text-status-safe', label: 'Delivered', dot: 'bg-[hsl(var(--status-safe))]' },
  installed: { bg: 'bg-status-safe-bg', text: 'text-status-safe', label: 'Installed', dot: 'bg-[hsl(var(--status-safe))]' },
  on_hold: { bg: 'bg-status-unsafe-bg', text: 'text-status-unsafe', label: 'On Hold', dot: 'bg-[hsl(var(--status-unsafe))]' },
};

type ZoomLevel = 'day' | 'week' | 'month';

interface TaskGanttProps {
  projectId: string;
  projectStartDate: string;
  projectEndDate: string;
  items?: ProjectItem[];
  members?: { id: string; display_name: string | null; email: string | null }[];
}

/* ── Calculate task progress ── */
function calcTaskProgress(task: ProjectTask): number {
  if (task.status === 'done') return 100;
  if (task.status === 'todo') return 0;
  if (task.status === 'blocked') return 0;
  // in_progress: estimate based on time elapsed
  if (task.start_date && task.end_date) {
    const total = differenceInDays(parseISO(task.end_date), parseISO(task.start_date));
    const elapsed = differenceInDays(new Date(), parseISO(task.start_date));
    if (total <= 0) return 50;
    return Math.min(Math.max(Math.round((elapsed / total) * 100), 5), 95);
  }
  return 50; // default for in_progress without dates
}

/* ── Calculate item progress ── */
function calcItemProgress(item: ProjectItem): number {
  const stages = [
    item.lifecycle_status === 'installed',
    item.installed,
    item.received,
    item.purchased,
    item.approval_status === 'approved',
    item.boq_included,
  ];
  // Weight: each stage = ~16%
  const completed = stages.filter(Boolean).length;
  return Math.round((completed / stages.length) * 100);
}

/* ── Convert items to GanttRows ── */
function itemsToRows(items: ProjectItem[]): GanttRow[] {
  return items
    .filter(item => item.production_due_date || item.delivery_date || item.site_movement_date || item.installation_start_date || item.installed_date)
    .map(item => {
      const phases: GanttRow['phases'] = [];
      if (item.production_due_date) {
        phases.push({ key: 'production', label: 'Production', color: ITEM_PHASE_COLORS.production.bar, start: item.production_due_date, end: item.delivery_date });
      }
      if (item.delivery_date) {
        phases.push({ key: 'transit', label: 'Transit', color: ITEM_PHASE_COLORS.transit.bar, start: item.delivery_date, end: item.received_date || item.site_movement_date });
      }
      if (item.site_movement_date) {
        phases.push({ key: 'site', label: 'Site Move', color: ITEM_PHASE_COLORS.site.bar, start: item.site_movement_date, end: item.installation_start_date });
      }
      if (item.installation_start_date) {
        phases.push({ key: 'install', label: 'Install', color: ITEM_PHASE_COLORS.install.bar, start: item.installation_start_date, end: item.installed_date });
      }

      const allDates = [item.production_due_date, item.delivery_date, item.received_date, item.site_movement_date, item.installation_start_date, item.installed_date].filter(Boolean) as string[];
      allDates.sort();

      return {
        id: `item-${item.id}`,
        type: 'item' as const,
        label: item.item_code || item.description.slice(0, 30),
        sublabel: item.description,
        group: `items_${item.category}`,
        status: item.lifecycle_status || 'draft',
        startDate: allDates[0] || null,
        endDate: allDates[allDates.length - 1] || null,
        progress: calcItemProgress(item),
        phases,
      };
    });
}

export function TaskGantt({ projectId, projectStartDate, projectEndDate, items = [], members = [] }: TaskGanttProps) {
  const { data: tasks = [], isLoading } = useProjectTasks(projectId);
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const { missingTasks, syncSuggestions, generateTemplateTasks, hasTemplate, isGenerating } = useTaskTemplate(
    projectId, items, projectStartDate, projectEndDate
  );

  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<ProjectTask | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Drag state
  const [dragging, setDragging] = useState<{ rowId: string; edge: 'start' | 'end' | 'move'; initialX: number; initialStart: string; initialEnd: string } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ start: string; end: string } | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const toggleGroup = (g: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  };

  /* ── Merge tasks + items into unified rows ── */
  const allRows = useMemo(() => {
    const taskRows: GanttRow[] = tasks.map(t => ({
      id: t.id,
      type: 'task' as const,
      label: t.title,
      group: t.macro_area,
      status: t.status,
      assignee: t.assignee_id || undefined,
      startDate: t.start_date,
      endDate: t.end_date,
      progress: calcTaskProgress(t),
      dependsOn: (t as any).depends_on || undefined,
      task: t,
    }));
    const itemRows = itemsToRows(items);

    // Add approval gate milestone rows
    const gateRows: GanttRow[] = [];
    const pendingItems = items.filter(i => i.approval_status === 'pending' || i.approval_status === 'revision');
    if (pendingItems.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      gateRows.push({
        id: 'gate-approval',
        type: 'task' as const,
        label: `⚠️ ${pendingItems.length} items awaiting approval`,
        group: 'design_validation',
        status: 'blocked',
        startDate: today,
        endDate: today,
        progress: 0,
      });
    }
    const readyToOrder = items.filter(i => i.approval_status === 'approved' && !i.purchased);
    if (readyToOrder.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      gateRows.push({
        id: 'gate-procurement',
        type: 'task' as const,
        label: `🟢 ${readyToOrder.length} items ready to order`,
        group: 'procurement',
        status: 'todo',
        startDate: today,
        endDate: today,
        progress: 0,
      });
    }

    return [...gateRows, ...taskRows, ...itemRows];
  }, [tasks, items]);

  /* ── Group rows ── */
  const groupedRows = useMemo(() => {
    const groups: Record<string, GanttRow[]> = {};
    allRows.forEach(r => {
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
  }, [allRows]);

  /* ── Flat row list for dependency line positioning ── */
  const flatVisibleRows = useMemo(() => {
    const flat: GanttRow[] = [];
    groupedRows.forEach(({ group, rows }) => {
      flat.push({ id: `group-${group}`, type: 'task', label: '', group, status: '', startDate: null, endDate: null, progress: 0 }); // placeholder for group header
      if (!collapsedGroups.has(group)) {
        rows.forEach(r => flat.push(r));
      }
    });
    return flat;
  }, [groupedRows, collapsedGroups]);

  /* ── Timeline range ── */
  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    let earliest = parseISO(projectStartDate);
    let latest = parseISO(projectEndDate);
    allRows.forEach(r => {
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
  }, [allRows, projectStartDate, projectEndDate]);

  /* ── Column headers ── */
  const columns = useMemo(() => {
    const cols: { label: string; sub?: string; startDay: number; widthDays: number }[] = [];
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
      if (widthDays > 0) cols.push({ label, sub, startDay, widthDays });
      cursor = nextCursor;
    }
    return cols;
  }, [timelineStart, timelineEnd, totalDays, zoom]);

  const dayToPercent = (day: number) => (day / totalDays) * 100;
  const todayOffset = differenceInDays(new Date(), timelineStart);
  const todayPercent = dayToPercent(todayOffset);

  const handleDeleteConfirm = async () => {
    if (!taskToDelete) return;
    try {
      await deleteTask.mutateAsync({ id: taskToDelete.id, projectId });
      toast.success('Task deleted');
      setDeleteDialogOpen(false);
      setTaskToDelete(null);
    } catch { toast.error('Failed to delete'); }
  };

  const handleStatusToggle = async (task: ProjectTask) => {
    const next = task.status === 'done' ? 'todo' : task.status === 'todo' ? 'in_progress' : 'done';
    try {
      await updateTask.mutateAsync({ id: task.id, projectId, status: next } as any);
    } catch { toast.error('Failed to update'); }
  };

  const getMemberName = (id: string | undefined) => {
    if (!id) return '';
    const m = members.find(m => m.id === id);
    return m?.display_name || m?.email?.split('@')[0] || '';
  };

  /* ── Drag & Drop handlers ── */
  const handleDragStart = useCallback((e: React.MouseEvent, rowId: string, edge: 'start' | 'end' | 'move', startDate: string, endDate: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging({ rowId, edge, initialX: e.clientX, initialStart: startDate, initialEnd: endDate });
    setDragPreview({ start: startDate, end: endDate });
  }, []);

  const handleDragMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const deltaX = e.clientX - dragging.initialX;
    const deltaDays = Math.round((deltaX / rect.width) * totalDays);

    const origStart = parseISO(dragging.initialStart);
    const origEnd = parseISO(dragging.initialEnd);

    if (dragging.edge === 'move') {
      setDragPreview({
        start: format(addDays(origStart, deltaDays), 'yyyy-MM-dd'),
        end: format(addDays(origEnd, deltaDays), 'yyyy-MM-dd'),
      });
    } else if (dragging.edge === 'start') {
      const newStart = addDays(origStart, deltaDays);
      if (isBefore(newStart, origEnd)) {
        setDragPreview({ start: format(newStart, 'yyyy-MM-dd'), end: dragging.initialEnd });
      }
    } else {
      const newEnd = addDays(origEnd, deltaDays);
      if (isAfter(newEnd, origStart)) {
        setDragPreview({ start: dragging.initialStart, end: format(newEnd, 'yyyy-MM-dd') });
      }
    }
  }, [dragging, totalDays]);

  const handleDragEnd = useCallback(async () => {
    if (!dragging || !dragPreview) { setDragging(null); setDragPreview(null); return; }
    const row = allRows.find(r => r.id === dragging.rowId);
    if (row?.type === 'task' && row.task) {
      try {
        await updateTask.mutateAsync({
          id: row.task.id,
          projectId,
          start_date: dragPreview.start,
          end_date: dragPreview.end,
        } as any);
        toast.success('Dates updated');
      } catch { toast.error('Failed to update dates'); }
    }
    setDragging(null);
    setDragPreview(null);
  }, [dragging, dragPreview, allRows, updateTask, projectId]);

  /* ── Dependency lines computation ── */
  const dependencyLines = useMemo(() => {
    const lines: { fromIdx: number; toIdx: number; fromEnd: number; toStart: number }[] = [];
    allRows.forEach((row) => {
      if (!row.dependsOn) return;
      const fromRow = allRows.find(r => r.id === row.dependsOn);
      if (!fromRow || !fromRow.endDate || !row.startDate) return;
      const fromIdx = flatVisibleRows.findIndex(r => r.id === fromRow.id);
      const toIdx = flatVisibleRows.findIndex(r => r.id === row.id);
      if (fromIdx < 0 || toIdx < 0) return;
      const fromEnd = dayToPercent(differenceInDays(parseISO(fromRow.endDate), timelineStart));
      const toStart = dayToPercent(differenceInDays(parseISO(row.startDate), timelineStart));
      lines.push({ fromIdx, toIdx, fromEnd, toStart });
    });
    return lines;
  }, [allRows, flatVisibleRows, timelineStart, dayToPercent]);

  const ROW_H = 36;
  const GROUP_H = 32;
  const LEFT_W = 460;

  return (
    <div
      className="bg-card rounded-xl border border-border overflow-hidden shadow-lg"
      onMouseMove={dragging ? handleDragMove : undefined}
      onMouseUp={dragging ? handleDragEnd : undefined}
      onMouseLeave={dragging ? handleDragEnd : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface-elevated">
        <div>
          <h3 className="font-bold text-foreground text-base">Project Timeline</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {tasks.length} tasks · {allRows.filter(r => r.type === 'item').length} items with dates
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Phase legend */}
          <div className="hidden xl:flex items-center gap-3 text-xs text-muted-foreground mr-3 border-r border-border pr-3">
            {Object.entries(ITEM_PHASE_COLORS).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={cn('w-3 h-2.5 rounded-sm', v.bar)} />
                <span>{v.label}</span>
              </span>
            ))}
          </div>
          {/* Zoom */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <Button variant="ghost" size="sm" className="h-8 px-2.5 rounded-none" onClick={() => setZoom(z => z === 'month' ? 'week' : 'day')}>
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs px-3 border-x border-border text-muted-foreground min-w-[55px] text-center capitalize font-medium">{zoom}</span>
            <Button variant="ghost" size="sm" className="h-8 px-2.5 rounded-none" onClick={() => setZoom(z => z === 'day' ? 'week' : 'month')}>
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
          </div>
          <Button size="sm" className="h-8" onClick={() => { setEditingTask(null); setTaskDialogOpen(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Task
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-10 text-center text-muted-foreground text-sm">Loading timeline...</div>
      ) : allRows.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-sm text-muted-foreground mb-4">No tasks or items with dates yet.</p>
          <Button variant="outline" size="sm" onClick={() => { setEditingTask(null); setTaskDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add Task
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: LEFT_W + 700 }}>
            {/* Column headers */}
            <div className="flex border-b border-border bg-muted/30 sticky top-0 z-20">
              <div className="flex items-center border-r border-border bg-muted/30" style={{ width: LEFT_W, minWidth: LEFT_W }}>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-4 w-[210px]">Task / Item</span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 w-[80px]">Assignee</span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 w-[75px]">Status</span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 w-[95px]">Dates</span>
              </div>
              <div className="flex-1 relative h-9">
                {columns.map((col, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full flex flex-col justify-center border-r border-border/30 px-1.5"
                    style={{ left: `${dayToPercent(col.startDay)}%`, width: `${dayToPercent(col.widthDays)}%` }}
                  >
                    <span className="text-[10px] font-medium text-muted-foreground truncate">{col.label}</span>
                    {col.sub && <span className="text-[9px] text-muted-foreground/60">{col.sub}</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Rows */}
            <div className="relative" ref={timelineRef}>
              {/* Today line */}
              {todayPercent >= 0 && todayPercent <= 100 && (
                <div
                  className="absolute top-0 bottom-0 z-20 pointer-events-none"
                  style={{ left: `calc(${LEFT_W}px + (100% - ${LEFT_W}px) * ${todayPercent / 100})` }}
                >
                  <div className="w-0.5 h-full bg-destructive/70" />
                  <span className="absolute -top-0 -translate-x-1/2 text-[8px] font-bold bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-b-md tracking-wide">
                    TODAY
                  </span>
                </div>
              )}

              {/* Dependency SVG overlay */}
              {dependencyLines.length > 0 && (
                <svg
                  className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
                  style={{ overflow: 'visible' }}
                >
                  {dependencyLines.map((line, i) => {
                    const fromY = line.fromIdx * ROW_H + ROW_H / 2;
                    const toY = line.toIdx * ROW_H + ROW_H / 2;
                    // Convert percent to SVG coordinates relative to timeline area
                    // This is approximate since SVG covers the whole area
                    return (
                      <g key={i}>
                        <line
                          x1={`${LEFT_W + 10}px`}
                          y1={fromY}
                          x2={`${LEFT_W + 10}px`}
                          y2={toY}
                          stroke="hsl(var(--muted-foreground))"
                          strokeWidth="1.5"
                          strokeDasharray="4 2"
                          opacity="0.4"
                        />
                        {/* Arrow */}
                        <polygon
                          points={`${LEFT_W + 6},${toY - 4} ${LEFT_W + 14},${toY} ${LEFT_W + 6},${toY + 4}`}
                          fill="hsl(var(--muted-foreground))"
                          opacity="0.4"
                        />
                      </g>
                    );
                  })}
                </svg>
              )}

              {groupedRows.map(({ group, rows }) => {
                const isCollapsed = collapsedGroups.has(group);
                const gc = GROUP_COLORS[group] || { bar: 'bg-muted-foreground', bg: 'bg-muted/5' };
                const doneCount = rows.filter(r => r.status === 'done' || r.status === 'installed').length;
                const groupProgress = rows.length > 0 ? Math.round((doneCount / rows.length) * 100) : 0;

                return (
                  <div key={group}>
                    {/* Group header */}
                    <button
                      onClick={() => toggleGroup(group)}
                      className={cn(
                        'w-full flex items-center border-b border-border/40 transition-colors hover:bg-surface-hover',
                        gc.bg
                      )}
                      style={{ height: GROUP_H }}
                    >
                      <div className="flex items-center gap-2 px-4" style={{ width: LEFT_W }}>
                        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                        <span className={cn('w-3 h-3 rounded', gc.bar)} />
                        <span className="text-xs font-bold text-foreground">{GROUP_LABELS[group] || group}</span>
                        <span className="text-[10px] text-muted-foreground ml-1">({rows.length})</span>
                        {/* Group progress mini bar */}
                        <div className="ml-auto mr-4 flex items-center gap-1.5">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={cn('h-full rounded-full transition-all', gc.bar)} style={{ width: `${groupProgress}%` }} />
                          </div>
                          <span className="text-[9px] text-muted-foreground font-mono">{groupProgress}%</span>
                        </div>
                      </div>
                    </button>

                    {!isCollapsed && rows.map((row, idx) => {
                      const sStyle = STATUS_STYLES[row.status] || STATUS_STYLES.todo;
                      const isDraggingThis = dragging?.rowId === row.id;
                      const displayStart = isDraggingThis && dragPreview ? dragPreview.start : row.startDate;
                      const displayEnd = isDraggingThis && dragPreview ? dragPreview.end : row.endDate;

                      return (
                        <div
                          key={row.id}
                          className={cn(
                            'flex items-center border-b border-border/20 transition-colors group/row relative',
                            idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/5',
                            isDraggingThis && 'bg-primary/5'
                          )}
                          style={{ height: ROW_H }}
                        >
                          {/* Left panel */}
                          <div className="flex items-center border-r border-border/40" style={{ width: LEFT_W, minWidth: LEFT_W }}>
                            <div className="flex items-center gap-2 px-4 w-[210px]">
                              {row.type === 'task' && row.task ? (
                                <button
                                  onClick={() => handleStatusToggle(row.task!)}
                                  className={cn(
                                    'w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all duration-200 flex items-center justify-center',
                                    row.status === 'done' ? 'bg-[hsl(var(--status-safe))] border-[hsl(var(--status-safe))]' :
                                    row.status === 'in_progress' ? 'border-primary bg-primary/20' :
                                    row.status === 'blocked' ? 'border-[hsl(var(--status-unsafe))] bg-[hsl(var(--status-unsafe))]/20' :
                                    'border-muted-foreground/40'
                                  )}
                                >
                                  {row.status === 'done' && (
                                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                  )}
                                </button>
                              ) : (
                                <Package className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              )}
                              <span className={cn('text-[11px] truncate font-medium', row.status === 'done' && 'line-through text-muted-foreground')} title={row.sublabel || row.label}>
                                {row.type === 'item' && row.label !== row.sublabel ? (
                                  <span className="font-mono text-primary/80 mr-1 text-[10px]">{row.label}</span>
                                ) : null}
                                {row.type === 'item' ? (row.sublabel || row.label) : row.label}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground px-2 w-[80px] truncate">
                              {getMemberName(row.assignee) || '—'}
                            </span>
                            <div className="flex items-center gap-1.5 px-2 w-[75px]">
                              <span className={cn('w-2 h-2 rounded-full flex-shrink-0', sStyle.dot)} />
                              <span className={cn('text-[10px] truncate', sStyle.text)}>
                                {sStyle.label}
                              </span>
                            </div>
                            <span className="text-[9px] font-mono text-muted-foreground px-2 w-[95px] truncate">
                              {displayStart ? format(parseISO(displayStart), 'dd/MM') : '—'}
                              {displayEnd ? ` → ${format(parseISO(displayEnd), 'dd/MM')}` : ''}
                            </span>
                          </div>

                          {/* Calendar bars */}
                          <div className="flex-1 relative h-full">
                            {/* Grid lines */}
                            {columns.map((col, i) => (
                              <div
                                key={i}
                                className="absolute top-0 h-full border-r border-border/10"
                                style={{ left: `${dayToPercent(col.startDay)}%`, width: `${dayToPercent(col.widthDays)}%` }}
                              />
                            ))}

                            {row.type === 'task' ? (
                              /* Task bar with progress */
                              displayStart && displayEnd ? (() => {
                                const barLeft = dayToPercent(differenceInDays(parseISO(displayStart), timelineStart));
                                const barWidth = Math.max(dayToPercent(differenceInDays(parseISO(displayEnd), parseISO(displayStart))), 0.5);
                                return (
                                  <TooltipProvider key="task-bar">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div
                                          className={cn(
                                            'absolute top-1/2 -translate-y-1/2 h-[22px] rounded-md overflow-hidden transition-shadow',
                                            isDraggingThis ? 'shadow-lg ring-2 ring-primary/30' : 'hover:shadow-md',
                                            'cursor-grab active:cursor-grabbing'
                                          )}
                                          style={{
                                            left: `${barLeft}%`,
                                            width: `${barWidth}%`,
                                            minWidth: 8,
                                          }}
                                          onMouseDown={(e) => row.task && handleDragStart(e, row.id, 'move', displayStart, displayEnd)}
                                        >
                                          {/* Background */}
                                          <div className={cn('absolute inset-0 opacity-30 rounded-md', gc.bar)} />
                                          {/* Progress fill */}
                                          <div
                                            className={cn('absolute inset-y-0 left-0 rounded-l-md', gc.bar)}
                                            style={{ width: `${row.progress}%`, opacity: 0.85 }}
                                          />
                                          {/* Label */}
                                          <span className="relative z-10 text-[9px] text-foreground font-medium px-1.5 truncate block leading-[22px]">
                                            {row.label}
                                          </span>
                                          {/* Resize handles */}
                                          <div
                                            className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-foreground/10 rounded-l-md"
                                            onMouseDown={(e) => { e.stopPropagation(); row.task && handleDragStart(e, row.id, 'start', displayStart, displayEnd); }}
                                          />
                                          <div
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-foreground/10 rounded-r-md"
                                            onMouseDown={(e) => { e.stopPropagation(); row.task && handleDragStart(e, row.id, 'end', displayStart, displayEnd); }}
                                          />
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-[220px]">
                                        <p className="text-xs font-semibold">{row.label}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {format(parseISO(displayStart), 'dd MMM yyyy')} → {format(parseISO(displayEnd), 'dd MMM yyyy')}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                          <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                                            <div className={cn('h-full rounded-full', gc.bar)} style={{ width: `${row.progress}%` }} />
                                          </div>
                                          <span className="text-[10px] text-muted-foreground">{row.progress}%</span>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })() : displayStart ? (
                                <div
                                  className={cn('absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ring-2 ring-background', gc.bar)}
                                  style={{ left: `${dayToPercent(differenceInDays(parseISO(displayStart), timelineStart))}%` }}
                                />
                              ) : null
                            ) : (
                              /* Multi-phase bars for items with progress overlay */
                              <>
                                {row.phases?.map(phase => {
                                  const s = differenceInDays(parseISO(phase.start), timelineStart);
                                  const e = phase.end ? differenceInDays(parseISO(phase.end), timelineStart) : s + 3;
                                  const left = dayToPercent(s);
                                  const width = dayToPercent(Math.max(e - s, 1));
                                  return (
                                    <TooltipProvider key={phase.key}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div
                                            className={cn('absolute top-1/2 -translate-y-1/2 h-[18px] rounded-md overflow-hidden')}
                                            style={{ left: `${left}%`, width: `${Math.max(width, 0.3)}%`, minWidth: 6 }}
                                          >
                                            <div className={cn('absolute inset-0 opacity-30', phase.color)} />
                                            <div className={cn('absolute inset-y-0 left-0', phase.color)} style={{ width: `${row.progress}%`, opacity: 0.7 }} />
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs font-semibold">{phase.label}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {format(parseISO(phase.start), 'dd MMM yyyy')}
                                            {phase.end ? ` → ${format(parseISO(phase.end), 'dd MMM yyyy')}` : ''}
                                          </p>
                                          <div className="flex items-center gap-2 mt-1">
                                            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                                              <div className={cn('h-full rounded-full', phase.color)} style={{ width: `${row.progress}%` }} />
                                            </div>
                                            <span className="text-[10px] text-muted-foreground">{row.progress}%</span>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  );
                                })}
                              </>
                            )}
                          </div>

                          {/* Hover actions for tasks */}
                          {row.type === 'task' && row.task && (
                            <div className="absolute right-2 hidden group-hover/row:flex items-center gap-0.5 bg-card/90 backdrop-blur-sm rounded-md shadow-sm border border-border px-1 py-0.5">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingTask(row.task!); setTaskDialogOpen(true); }}>
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => { setTaskToDelete(row.task!); setDeleteDialogOpen(true); }}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Task Form Dialog */}
      <TaskFormDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        projectId={projectId}
        task={editingTask}
        members={members}
        tasks={tasks}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{taskToDelete?.title}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
