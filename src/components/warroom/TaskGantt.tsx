import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { differenceInDays, parseISO, format, addDays, isBefore, isAfter } from 'date-fns';
import { Plus, ZoomIn, ZoomOut, Wand2, RefreshCw, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useProjectTasks, useDeleteTask, useUpdateTask, ProjectTask } from '@/hooks/useTasks';
import { useTaskTemplate } from '@/hooks/useTaskTemplate';
import { useAuth } from '@/hooks/useAuth';
import { TaskFormDialog } from './TaskFormDialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Database } from '@/integrations/supabase/types';
import { useProjectMilestones, ProjectMilestone } from '@/hooks/useMilestones';
import { GanttRow as GanttRowType, DragState, ZoomLevel, QuickFilter } from './gantt/types';
import { LEFT_PANEL_WIDTH, ROW_HEIGHT, ITEM_PHASE_STYLES } from './gantt/constants';
import { calcTaskProgress, itemsToRows, computeTimelineRange, computeColumns, computeMonthColumns, groupRows, dayToPercent } from './gantt/helpers';
import { GanttGroupHeader } from './gantt/GanttGroupHeader';
import { GanttRowComponent } from './gantt/GanttRow';
import { GanttDependencyArrows } from './gantt/GanttDependencyArrows';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];

interface TaskGanttProps {
  projectId: string;
  projectStartDate: string;
  projectEndDate: string;
  items?: ProjectItem[];
  members?: { id: string; display_name: string | null; email: string | null; avatar_url?: string | null }[];
  onItemClick?: (itemId: string) => void;
}

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'waiting_for_me', label: 'Waiting for me' },
  { key: 'waiting_from_client', label: 'From client' },
  { key: 'waiting_from_supplier', label: 'From supplier' },
  { key: 'delayed', label: 'Delayed' },
  { key: 'at_risk', label: 'At risk' },
  { key: 'on_hold', label: 'On hold' },
  { key: 'cancelled', label: 'Cancelled' },
];

export function TaskGantt({ projectId, projectStartDate, projectEndDate, items = [], members = [], onItemClick }: TaskGanttProps) {
  const { user } = useAuth();
  const { data: tasks = [], isLoading } = useProjectTasks(projectId);
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const { missingTasks, syncSuggestions, generateTemplateTasks, syncTasks, hasTemplate, isGenerating, isSyncing } = useTaskTemplate(
    projectId, items, projectStartDate, projectEndDate
  );

  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<ProjectTask | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<{ start: string; end: string } | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  // Drag-to-scroll
  const [isPanning, setIsPanning] = useState(false);
  const panStartX = useRef(0);
  const panScrollLeft = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width));
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const toggleGroup = (g: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  };

  /* ── Build rows ── */
  const allRows = useMemo(() => {
    const linkedTasks = tasks.filter(t => t.linked_item_id);
    const unlinkedTasks = tasks.filter(t => !t.linked_item_id);

    const freeTaskRows: GanttRowType[] = unlinkedTasks.map(t => ({
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

    const itemRows = itemsToRows(items, projectStartDate, projectEndDate, linkedTasks);
    return [...freeTaskRows, ...itemRows];
  }, [tasks, items, projectStartDate, projectEndDate]);

  /* ── Filter ── */
  const filteredRows = useMemo(() => {
    if (quickFilter === 'all') return allRows;
    
    return allRows.filter(row => {
      // For sub-tasks, include if parent item matches
      if (row.isSubTask) {
        const parentRow = allRows.find(r => r.type === 'item' && r.itemId === row.parentItemId);
        if (parentRow) return matchesFilter(parentRow, quickFilter, user?.id);
        return false;
      }
      return matchesFilter(row, quickFilter, user?.id);
    });
  }, [allRows, quickFilter, user?.id]);

  const grouped = useMemo(() => groupRows(filteredRows), [filteredRows]);

  const flatVisibleRows = useMemo(() => {
    const flat: GanttRowType[] = [];
    grouped.forEach(({ group, rows }) => {
      if (!collapsedGroups.has(group)) rows.forEach(r => flat.push(r));
    });
    return flat;
  }, [grouped, collapsedGroups]);

  /* ── Summary counts ── */
  const counts = useMemo(() => {
    const itemRows = allRows.filter(r => r.type === 'item');
    return {
      total: itemRows.length,
      delayed: itemRows.filter(r => r.delayed).length,
      atRisk: itemRows.filter(r => r.atRisk && !r.delayed).length,
      onHold: itemRows.filter(r => r.isOnHold).length,
      waitingMe: allRows.filter(r => r.type === 'task' && r.assignee === user?.id && r.status !== 'done').length,
    };
  }, [allRows, user?.id]);

  const { timelineStart, timelineEnd, totalDays } = useMemo(
    () => computeTimelineRange(filteredRows.length > 0 ? filteredRows : allRows, projectStartDate, projectEndDate),
    [filteredRows, allRows, projectStartDate, projectEndDate]
  );

  const columns = useMemo(() => computeColumns(timelineStart, timelineEnd, totalDays, zoom), [timelineStart, timelineEnd, totalDays, zoom]);
  const monthColumns = useMemo(() => computeMonthColumns(timelineStart, timelineEnd, totalDays), [timelineStart, timelineEnd, totalDays]);
  const todayPercent = dayToPercent(differenceInDays(new Date(), timelineStart), totalDays);

  /* ── Handlers ── */
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
    if (task.completion_fields && task.completion_fields.length > 0) {
      toast.info('This task auto-completes when the required fields are filled on the item');
      return;
    }
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

  /* ── Drag ── */
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
      setDragPreview({ start: format(addDays(origStart, deltaDays), 'yyyy-MM-dd'), end: format(addDays(origEnd, deltaDays), 'yyyy-MM-dd') });
    } else if (dragging.edge === 'start') {
      const newStart = addDays(origStart, deltaDays);
      if (isBefore(newStart, origEnd)) setDragPreview({ start: format(newStart, 'yyyy-MM-dd'), end: dragging.initialEnd });
    } else {
      const newEnd = addDays(origEnd, deltaDays);
      if (isAfter(newEnd, origStart)) setDragPreview({ start: dragging.initialStart, end: format(newEnd, 'yyyy-MM-dd') });
    }
  }, [dragging, totalDays]);

  const handleDragEnd = useCallback(async () => {
    if (!dragging || !dragPreview) { setDragging(null); setDragPreview(null); return; }
    const row = allRows.find(r => r.id === dragging.rowId);
    if (row?.type === 'task' && row.task) {
      try {
        await updateTask.mutateAsync({ id: row.task.id, projectId, start_date: dragPreview.start, end_date: dragPreview.end } as any);
        toast.success('Dates updated');
      } catch { toast.error('Failed to update dates'); }
    }
    setDragging(null);
    setDragPreview(null);
  }, [dragging, dragPreview, allRows, updateTask, projectId]);

  const scrollTimeline = useCallback((direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const step = scrollRef.current.clientWidth * 0.4;
    scrollRef.current.scrollBy({ left: direction === 'right' ? step : -step, behavior: 'smooth' });
  }, []);

  const scrollToToday = useCallback(() => {
    if (!scrollRef.current) return;
    const totalWidth = scrollRef.current.scrollWidth;
    const viewWidth = scrollRef.current.clientWidth;
    const todayPos = (todayPercent / 100) * totalWidth;
    scrollRef.current.scrollTo({ left: Math.max(0, todayPos - viewWidth / 2), behavior: 'smooth' });
  }, [todayPercent]);

  // Pan handlers
  const handlePanStart = useCallback((e: React.MouseEvent) => {
    if (dragging) return;
    if ((e.target as HTMLElement).closest('button, [role="button"]')) return;
    setIsPanning(true);
    panStartX.current = e.clientX;
    panScrollLeft.current = scrollRef.current?.scrollLeft || 0;
  }, [dragging]);

  const handlePanMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !scrollRef.current) return;
    scrollRef.current.scrollLeft = panScrollLeft.current - (e.clientX - panStartX.current);
  }, [isPanning]);

  const handlePanEnd = useCallback(() => setIsPanning(false), []);

  return (
    <div ref={containerRef} className="bg-card rounded-xl border border-border/50 overflow-hidden">
      {/* ── Header ── */}
      <div className="px-4 py-2.5 border-b border-border/30 space-y-2">
        {/* Top row: title + actions */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-[14px] tracking-tight">Project Timeline</h3>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">
              {counts.total} items
              {counts.delayed > 0 && <span className="text-destructive ml-1.5 font-medium">{counts.delayed} delayed</span>}
              {counts.atRisk > 0 && <span className="text-[hsl(var(--status-at-risk))] ml-1.5">{counts.atRisk} at risk</span>}
              {counts.waitingMe > 0 && <span className="text-primary ml-1.5">{counts.waitingMe} waiting for you</span>}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Phase legend */}
            <div className="hidden xl:flex items-center gap-2 text-[9px] text-muted-foreground/50 mr-2 border-r border-border/20 pr-2">
              {['planning', 'design_validation', 'procurement', 'production', 'delivery', 'installation', 'closing'].map(k => {
                const v = ITEM_PHASE_STYLES[k];
                if (!v) return null;
                return (
                  <span key={k} className="flex items-center gap-1">
                    <div className="w-2 h-1.5 rounded-sm" style={{ background: v.color }} />
                    <span>{v.label}</span>
                  </span>
                );
              })}
            </div>

            {/* Timeline nav */}
            <div className="flex items-center border border-border/30 rounded-md overflow-hidden">
              <Button variant="ghost" size="sm" className="h-6 px-1.5 rounded-none" onClick={() => scrollTimeline('left')}>
                <ChevronLeft className="w-3 h-3 text-muted-foreground/60" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-1.5 rounded-none border-x border-border/20" onClick={scrollToToday}>
                <CalendarDays className="w-3 h-3 text-muted-foreground/60" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-1.5 rounded-none" onClick={() => scrollTimeline('right')}>
                <ChevronRight className="w-3 h-3 text-muted-foreground/60" />
              </Button>
            </div>

            {/* Zoom */}
            <div className="flex items-center border border-border/30 rounded-md overflow-hidden">
              <Button variant="ghost" size="sm" className="h-6 px-1.5 rounded-none" onClick={() => setZoom(z => z === 'month' ? 'week' : 'day')}>
                <ZoomIn className="w-3 h-3 text-muted-foreground/60" />
              </Button>
              <span className="text-[9px] px-2 border-x border-border/20 text-muted-foreground/50 min-w-[40px] text-center capitalize font-medium">{zoom}</span>
              <Button variant="ghost" size="sm" className="h-6 px-1.5 rounded-none" onClick={() => setZoom(z => z === 'day' ? 'week' : 'month')}>
                <ZoomOut className="w-3 h-3 text-muted-foreground/60" />
              </Button>
            </div>

            {/* Template actions */}
            {!hasTemplate && missingTasks.length > 0 && (
              <Button size="sm" variant="outline" className="h-6 text-[10px] border-border/30" onClick={generateTemplateTasks} disabled={isGenerating}>
                <Wand2 className="w-3 h-3 mr-1" /> Template
              </Button>
            )}
            {hasTemplate && missingTasks.length > 0 && (
              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={generateTemplateTasks} disabled={isGenerating}>
                <Wand2 className="w-3 h-3 mr-1" /> +{missingTasks.length}
              </Button>
            )}
            {syncSuggestions.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="secondary" className="h-5 text-[9px] gap-1 px-1.5" onClick={syncTasks} disabled={isSyncing}>
                      <RefreshCw className={cn('w-2.5 h-2.5', isSyncing && 'animate-spin')} /> {syncSuggestions.length}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">Sync tasks from item data</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <Button size="sm" className="h-6 text-[10px]" onClick={() => { setEditingTask(null); setTaskDialogOpen(true); }}>
              <Plus className="w-3 h-3 mr-1" /> Task
            </Button>
          </div>
        </div>

        {/* Quick filters */}
        <div className="flex items-center gap-1">
          {QUICK_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setQuickFilter(f.key)}
              className={cn(
                'text-[9px] font-medium px-2 py-1 rounded-md transition-colors',
                quickFilter === f.key
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30 border border-transparent'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground/40 text-sm">Loading timeline...</div>
      ) : allRows.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-sm text-muted-foreground/40 mb-4">No items with timeline data yet.</p>
          <Button variant="outline" size="sm" className="text-[10px]" onClick={() => { setEditingTask(null); setTaskDialogOpen(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add First Task
          </Button>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground/40 mb-2">No results match this filter.</p>
          <Button variant="ghost" size="sm" className="text-[10px]" onClick={() => setQuickFilter('all')}>
            Show all
          </Button>
        </div>
      ) : (
        <div
          className={cn('overflow-x-auto', isPanning && 'cursor-grabbing', !isPanning && 'cursor-grab')}
          ref={scrollRef}
          onMouseDown={handlePanStart}
          onMouseMove={(e) => { handlePanMove(e); if (dragging) handleDragMove(e); }}
          onMouseUp={() => { handlePanEnd(); if (dragging) handleDragEnd(); }}
          onMouseLeave={() => { handlePanEnd(); if (dragging) handleDragEnd(); }}
          style={{ userSelect: isPanning ? 'none' : undefined }}
        >
          <div style={{ minWidth: LEFT_PANEL_WIDTH + 900 }}>
            {/* Column headers */}
            <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm border-b border-border/40">
              {/* Month row */}
              <div className="flex border-b border-border/20">
                <div className="border-r border-border/30 bg-muted/[0.03]" style={{ width: LEFT_PANEL_WIDTH, minWidth: LEFT_PANEL_WIDTH }} />
                <div className="flex-1 relative h-6 bg-muted/[0.01]">
                  {monthColumns.map((col, i) => (
                    <div
                      key={i}
                      className="absolute top-0 h-full flex items-center justify-center border-r border-border/15"
                      style={{ left: `${dayToPercent(col.startDay, totalDays)}%`, width: `${dayToPercent(col.widthDays, totalDays)}%` }}
                    >
                      <span className="text-[9px] font-bold text-foreground/40 uppercase tracking-widest truncate px-1">{col.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Day/Week row */}
              <div className="flex">
                <div className="flex items-center border-r border-border/30 bg-muted/[0.03]" style={{ width: LEFT_PANEL_WIDTH, minWidth: LEFT_PANEL_WIDTH }}>
                  <span className="text-[8px] font-semibold text-muted-foreground/30 uppercase tracking-[0.08em] pl-8 flex-1">Item</span>
                  <span className="text-[8px] font-semibold text-muted-foreground/30 uppercase tracking-[0.08em] w-[60px] px-1">Status</span>
                  <span className="text-[8px] font-semibold text-muted-foreground/30 uppercase tracking-[0.08em] w-[65px] px-1">Dates</span>
                </div>
                <div className="flex-1 relative h-6">
                  {columns.map((col, i) => (
                    <div
                      key={i}
                      className={cn('absolute top-0 h-full flex flex-col justify-center border-r border-border/10 px-0.5', col.isWeekend && 'bg-muted/[0.06]')}
                      style={{ left: `${dayToPercent(col.startDay, totalDays)}%`, width: `${dayToPercent(col.widthDays, totalDays)}%` }}
                    >
                      <span className="text-[8px] font-semibold text-muted-foreground/40 truncate leading-tight">{col.label}</span>
                      {col.sub && <span className="text-[7px] text-muted-foreground/25 leading-tight">{col.sub}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Rows */}
            <div className="relative" ref={timelineRef}>
              {/* Today line */}
              {todayPercent >= 0 && todayPercent <= 100 && (
                <div
                  className="absolute top-0 bottom-0 z-20 pointer-events-none"
                  style={{ left: `calc(${LEFT_PANEL_WIDTH}px + (100% - ${LEFT_PANEL_WIDTH}px) * ${todayPercent / 100})` }}
                >
                  <div className="w-[2px] h-full bg-destructive/35" />
                  <span className="absolute top-0 -translate-x-1/2 text-[6px] font-bold bg-destructive text-destructive-foreground px-1 py-[1px] rounded-b-sm tracking-wider uppercase">
                    Today
                  </span>
                </div>
              )}

              <GanttDependencyArrows
                allRows={filteredRows}
                flatVisibleRows={flatVisibleRows}
                timelineStart={timelineStart}
                totalDays={totalDays}
                containerWidth={containerWidth}
              />

              {grouped.map(({ group, rows }) => (
                <div key={group}>
                  <GanttGroupHeader
                    group={group}
                    rows={rows}
                    isCollapsed={collapsedGroups.has(group)}
                    onToggle={() => toggleGroup(group)}
                  />
                  {!collapsedGroups.has(group) && rows.map((row, idx) => (
                    <GanttRowComponent
                      key={row.id}
                      row={row}
                      index={idx}
                      columns={columns}
                      timelineStart={timelineStart}
                      totalDays={totalDays}
                      dragging={dragging}
                      dragPreview={dragPreview}
                      getMemberName={getMemberName}
                      onStatusToggle={handleStatusToggle}
                      onEdit={(t) => { setEditingTask(t); setTaskDialogOpen(true); }}
                      onDelete={(t) => { setTaskToDelete(t); setDeleteDialogOpen(true); }}
                      onDragStart={handleDragStart}
                      onItemDoubleClick={onItemClick}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <TaskFormDialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen} projectId={projectId} task={editingTask} members={members} tasks={tasks} items={items.map(i => ({ id: i.id, item_code: i.item_code, description: i.description, lifecycle_status: i.lifecycle_status }))} />
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete "{taskToDelete?.title}"?</AlertDialogDescription>
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

// ─── Filter matching ───

function matchesFilter(row: GanttRowType, filter: QuickFilter, userId?: string): boolean {
  switch (filter) {
    case 'all': return true;
    case 'waiting_for_me':
      if (row.type === 'item') {
        // Item has open tasks assigned to current user
        return false; // handled at task level
      }
      return row.assignee === userId && row.status !== 'done';
    case 'waiting_from_client':
      return row.waitingFor === 'client';
    case 'waiting_from_supplier':
      return row.waitingFor === 'supplier';
    case 'delayed':
      return row.delayed === true;
    case 'at_risk':
      return row.atRisk === true;
    case 'on_hold':
      return row.isOnHold === true;
    case 'cancelled':
      return row.isCancelled === true;
    default:
      return true;
  }
}
