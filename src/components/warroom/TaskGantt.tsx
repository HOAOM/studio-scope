import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { differenceInDays, parseISO, format, addDays, isBefore, isAfter } from 'date-fns';
import { Plus, ZoomIn, ZoomOut, Wand2, RefreshCw, Filter, AlertTriangle, Shield, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useProjectTasks, useDeleteTask, useUpdateTask, ProjectTask } from '@/hooks/useTasks';
import { useTaskTemplate } from '@/hooks/useTaskTemplate';
import { TaskFormDialog } from './TaskFormDialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Database } from '@/integrations/supabase/types';

import { GanttRow as GanttRowType, DragState, ZoomLevel } from './gantt/types';
import { LEFT_PANEL_WIDTH, ROW_HEIGHT, ITEM_PHASE_STYLES, GROUP_COLORS } from './gantt/constants';
import { calcTaskProgress, calcItemProgress, itemsToRows, computeTimelineRange, computeColumns, computeMonthColumns, groupRows, dayToPercent } from './gantt/helpers';
import { GanttGroupHeader } from './gantt/GanttGroupHeader';
import { GanttRowComponent } from './gantt/GanttRow';
import { GanttDependencyArrows } from './gantt/GanttDependencyArrows';
import { isGateBlocked, computeCriticalPath, GATE_REQUIREMENTS } from '@/lib/workflow';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];

interface TaskGanttProps {
  projectId: string;
  projectStartDate: string;
  projectEndDate: string;
  items?: ProjectItem[];
  members?: { id: string; display_name: string | null; email: string | null; avatar_url?: string | null }[];
  onItemClick?: (itemId: string) => void;
}

type FilterType = 'all' | 'tasks' | 'items';
type FilterStatus = 'all' | 'todo' | 'in_progress' | 'done' | 'blocked';
type FilterCategory = string; // 'all' or specific boq_category

export function TaskGantt({ projectId, projectStartDate, projectEndDate, items = [], members = [], onItemClick }: TaskGanttProps) {
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
  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  // Drag-to-scroll state
  const [isPanning, setIsPanning] = useState(false);
  const panStartX = useRef(0);
  const panScrollLeft = useRef(0);

  // Filters
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [showGateIndicators, setShowGateIndicators] = useState(true);

  const activeFilterCount = [filterType !== 'all', filterStatus !== 'all', filterCategory !== 'all', showCriticalPath].filter(Boolean).length;

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
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

  /* ── Build unified rows ── */
  const allRows = useMemo(() => {
    // Separate linked vs unlinked tasks
    const linkedTasks = tasks.filter(t => t.linked_item_id);
    const unlinkedTasks = tasks.filter(t => !t.linked_item_id);
    
    // Unlinked tasks (legacy, should be rare)
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
    
    // Items with their linked tasks nested underneath
    const itemRows = itemsToRows(items, projectStartDate, projectEndDate, linkedTasks);

    // Gate milestone rows
    const gateRows: GanttRowType[] = [];
    if (showGateIndicators) {
      const pendingItems = items.filter(i => i.approval_status === 'pending' || i.approval_status === 'revision');
      if (pendingItems.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        gateRows.push({ id: 'gate-approval', type: 'task', label: `⚠️ ${pendingItems.length} items awaiting approval`, group: 'design_validation', status: 'blocked', startDate: today, endDate: today, progress: 0 });
      }
      const readyToOrder = items.filter(i => i.approval_status === 'approved' && !i.purchased);
      if (readyToOrder.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        gateRows.push({ id: 'gate-procurement', type: 'task', label: `🟢 ${readyToOrder.length} items ready to order`, group: 'procurement', status: 'todo', startDate: today, endDate: today, progress: 0 });
      }
    }

    return [...gateRows, ...freeTaskRows, ...itemRows];
  }, [tasks, items, showGateIndicators, projectStartDate, projectEndDate]);

  /* ── Urgent tasks for alerts ── */
  const urgentTasks = useMemo(() => {
    return tasks.filter(t => t.linked_item_id && t.status !== 'done');
  }, [tasks]);

  /* ── Critical path ── */
  const criticalPathIds = useMemo(() => {
    if (!showCriticalPath) return new Set<string>();
    const nodes = allRows
      .filter(r => r.type === 'task' && r.startDate && r.endDate)
      .map(r => ({ id: r.id, startDate: r.startDate, endDate: r.endDate, dependsOn: r.dependsOn }));
    return computeCriticalPath(nodes);
  }, [allRows, showCriticalPath]);

  /* ── Apply filters ── */
  const filteredRows = useMemo(() => {
    return allRows.filter(row => {
      if (filterType === 'tasks' && row.type !== 'task') return false;
      if (filterType === 'items' && row.type !== 'item') return false;
      if (filterStatus !== 'all' && row.status !== filterStatus) return false;
      if (filterCategory !== 'all') {
        if (row.type === 'item' && !row.group.endsWith(filterCategory)) return false;
        if (row.type === 'task' && filterCategory !== row.group) return false;
      }
      if (showCriticalPath && row.type === 'task' && !criticalPathIds.has(row.id)) return false;
      return true;
    });
  }, [allRows, filterType, filterStatus, filterCategory, showCriticalPath, criticalPathIds]);

  const grouped = useMemo(() => groupRows(filteredRows), [filteredRows]);

  const flatVisibleRows = useMemo(() => {
    const flat: GanttRowType[] = [];
    grouped.forEach(({ group, rows }) => {
      if (!collapsedGroups.has(group)) rows.forEach(r => flat.push(r));
    });
    return flat;
  }, [grouped, collapsedGroups]);

  const { timelineStart, timelineEnd, totalDays } = useMemo(
    () => computeTimelineRange(filteredRows.length > 0 ? filteredRows : allRows, projectStartDate, projectEndDate),
    [filteredRows, allRows, projectStartDate, projectEndDate]
  );

  const columns = useMemo(
    () => computeColumns(timelineStart, timelineEnd, totalDays, zoom),
    [timelineStart, timelineEnd, totalDays, zoom]
  );

  const monthColumns = useMemo(
    () => computeMonthColumns(timelineStart, timelineEnd, totalDays),
    [timelineStart, timelineEnd, totalDays]
  );

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

  /* ── Drag & drop ── */
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

  // Unique categories from items for filter
  const itemCategories = useMemo(() => {
    const cats = new Set(items.map(i => i.category));
    return Array.from(cats).sort();
  }, [items]);

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

  // Drag-to-pan handlers
  const handlePanStart = useCallback((e: React.MouseEvent) => {
    if (dragging) return; // don't pan while dragging a bar
    if ((e.target as HTMLElement).closest('button, [role="button"]')) return;
    setIsPanning(true);
    panStartX.current = e.clientX;
    panScrollLeft.current = scrollRef.current?.scrollLeft || 0;
  }, [dragging]);

  const handlePanMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !scrollRef.current) return;
    const dx = e.clientX - panStartX.current;
    scrollRef.current.scrollLeft = panScrollLeft.current - dx;
  }, [isPanning]);

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  return (
    <div
      ref={containerRef}
      className="bg-card rounded-xl border border-border/60 overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
        <div>
          <h3 className="font-semibold text-foreground text-[15px] tracking-tight">Project Timeline</h3>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">
            {tasks.length} tasks · {allRows.filter(r => r.type === 'item').length} items
            {activeFilterCount > 0 && <span className="text-primary ml-1">· {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active</span>}
            {urgentTasks.length > 0 && <span className="text-destructive ml-1 font-medium">· ⚠ {urgentTasks.length} urgent task{urgentTasks.length > 1 ? 's' : ''}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Phase legend (compact) */}
          <div className="hidden xl:flex items-center gap-3 text-[10px] text-muted-foreground/60 mr-2 border-r border-border/30 pr-3">
            {['planning', 'design_validation', 'procurement', 'production', 'delivery', 'installation', 'closing'].map(k => {
              const v = ITEM_PHASE_STYLES[k];
              if (!v) return null;
              return (
                <span key={k} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2 rounded-sm" style={{ background: v.color }} />
                  <span>{v.label}</span>
                </span>
              );
            })}
          </div>

          {/* Filters dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-7 text-[11px] border-border/40 gap-1', activeFilterCount > 0 && 'border-primary/40 text-primary')}>
                <Filter className="w-3.5 h-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[9px] ml-0.5">{activeFilterCount}</Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Type</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={filterType === 'all'} onCheckedChange={() => setFilterType('all')}>All</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={filterType === 'tasks'} onCheckedChange={() => setFilterType('tasks')}>Tasks only</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={filterType === 'items'} onCheckedChange={() => setFilterType('items')}>Items only</DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Status</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={filterStatus === 'all'} onCheckedChange={() => setFilterStatus('all')}>All statuses</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={filterStatus === 'todo'} onCheckedChange={() => setFilterStatus(filterStatus === 'todo' ? 'all' : 'todo')}>To Do</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={filterStatus === 'in_progress'} onCheckedChange={() => setFilterStatus(filterStatus === 'in_progress' ? 'all' : 'in_progress')}>In Progress</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={filterStatus === 'done'} onCheckedChange={() => setFilterStatus(filterStatus === 'done' ? 'all' : 'done')}>Done</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={filterStatus === 'blocked'} onCheckedChange={() => setFilterStatus(filterStatus === 'blocked' ? 'all' : 'blocked')}>Blocked</DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Category</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={filterCategory === 'all'} onCheckedChange={() => setFilterCategory('all')}>All categories</DropdownMenuCheckboxItem>
              {itemCategories.map(cat => (
                <DropdownMenuCheckboxItem key={cat} checked={filterCategory === cat} onCheckedChange={() => setFilterCategory(filterCategory === cat ? 'all' : cat)}>
                  {cat.replace('-', ' ')}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Analysis</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={showCriticalPath} onCheckedChange={(v) => setShowCriticalPath(!!v)}>
                <AlertTriangle className="w-3 h-3 mr-1.5 text-destructive" /> Critical Path
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showGateIndicators} onCheckedChange={(v) => setShowGateIndicators(!!v)}>
                <Shield className="w-3 h-3 mr-1.5 text-primary" /> Gate Indicators
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Timeline navigation */}
          <div className="flex items-center border border-border/40 rounded-lg overflow-hidden bg-muted/[0.04]">
            <Button variant="ghost" size="sm" className="h-7 px-2 rounded-none hover:bg-muted/20" onClick={() => scrollTimeline('left')}>
              <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground/70" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 rounded-none border-x border-border/30 hover:bg-muted/20" onClick={scrollToToday}>
              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span className="text-[10px] ml-1 text-muted-foreground/60">Today</span>
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 rounded-none hover:bg-muted/20" onClick={() => scrollTimeline('right')}>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70" />
            </Button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center border border-border/40 rounded-lg overflow-hidden bg-muted/[0.04]">
            <Button variant="ghost" size="sm" className="h-7 px-2 rounded-none hover:bg-muted/20" onClick={() => setZoom(z => z === 'month' ? 'week' : 'day')}>
              <ZoomIn className="w-3.5 h-3.5 text-muted-foreground/70" />
            </Button>
            <span className="text-[10px] px-2.5 border-x border-border/30 text-muted-foreground/60 min-w-[48px] text-center capitalize font-medium">{zoom}</span>
            <Button variant="ghost" size="sm" className="h-7 px-2 rounded-none hover:bg-muted/20" onClick={() => setZoom(z => z === 'day' ? 'week' : 'month')}>
              <ZoomOut className="w-3.5 h-3.5 text-muted-foreground/70" />
            </Button>
          </div>

          {/* Template actions */}
          {!hasTemplate && missingTasks.length > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-[11px] border-border/40" onClick={generateTemplateTasks} disabled={isGenerating}>
              <Wand2 className="w-3.5 h-3.5 mr-1" /> Generate Template
            </Button>
          )}
          {hasTemplate && missingTasks.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={generateTemplateTasks} disabled={isGenerating}>
              <Wand2 className="w-3.5 h-3.5 mr-1" /> +{missingTasks.length}
            </Button>
          )}
          {syncSuggestions.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="secondary" className="h-6 text-[10px] gap-1 px-2" onClick={syncTasks} disabled={isSyncing}>
                    <RefreshCw className={cn('w-3 h-3', isSyncing && 'animate-spin')} /> {syncSuggestions.length}
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">Sync {syncSuggestions.length} tasks from item data</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <Button size="sm" className="h-7 text-[11px]" onClick={() => { setEditingTask(null); setTaskDialogOpen(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Task
          </Button>
        </div>
      </div>

      {/* ── Body ── */}
      {isLoading ? (
        <div className="p-12 text-center text-muted-foreground/50 text-sm">Loading timeline...</div>
      ) : allRows.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-sm text-muted-foreground/50 mb-4">No tasks or items with dates yet.</p>
          <Button variant="outline" size="sm" className="text-[11px]" onClick={() => { setEditingTask(null); setTaskDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add First Task
          </Button>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground/50 mb-2">No results match your filters.</p>
          <Button variant="ghost" size="sm" className="text-[11px]" onClick={() => { setFilterType('all'); setFilterStatus('all'); setFilterCategory('all'); setShowCriticalPath(false); }}>
            Clear all filters
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
            {/* Column headers — dual row: months on top, weeks/days below */}
            <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm border-b border-border/50">
              {/* Month row */}
              <div className="flex border-b border-border/30">
                <div className="border-r border-border/40 bg-muted/[0.04]" style={{ width: LEFT_PANEL_WIDTH, minWidth: LEFT_PANEL_WIDTH }} />
                <div className="flex-1 relative h-7 bg-muted/[0.02]">
                  {monthColumns.map((col, i) => (
                    <div
                      key={i}
                      className="absolute top-0 h-full flex items-center justify-center border-r border-border/25"
                      style={{ left: `${dayToPercent(col.startDay, totalDays)}%`, width: `${dayToPercent(col.widthDays, totalDays)}%` }}
                    >
                      <span className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest truncate px-2">{col.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Day/Week row + left panel labels */}
              <div className="flex">
                <div className="flex items-center border-r border-border/40 bg-muted/[0.04]" style={{ width: LEFT_PANEL_WIDTH, minWidth: LEFT_PANEL_WIDTH }}>
                  <span className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-[0.08em] pl-10 w-auto flex-1">Task / Item</span>
                  <span className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-[0.08em] w-[72px] px-1">Assignee</span>
                  <span className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-[0.08em] w-[70px] px-1">Status</span>
                  <span className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-[0.08em] w-[80px] px-1">Dates</span>
                </div>
                <div className="flex-1 relative h-7">
                  {columns.map((col, i) => (
                    <div
                      key={i}
                      className={cn(
                        'absolute top-0 h-full flex flex-col justify-center border-r border-border/15 px-1',
                        col.isWeekend && 'bg-muted/[0.08]'
                      )}
                      style={{ left: `${dayToPercent(col.startDay, totalDays)}%`, width: `${dayToPercent(col.widthDays, totalDays)}%` }}
                    >
                      <span className="text-[9px] font-semibold text-muted-foreground/50 truncate leading-tight">{col.label}</span>
                      {col.sub && <span className="text-[7px] text-muted-foreground/35 leading-tight font-medium">{col.sub}</span>}
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
                  <div className="w-[2px] h-full bg-destructive/40" />
                  <span className="absolute top-0 -translate-x-1/2 text-[7px] font-bold bg-destructive text-destructive-foreground px-1.5 py-[1px] rounded-b-md tracking-wider uppercase">
                    Today
                  </span>
                </div>
              )}

              {/* Dependency arrows */}
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
                      isCriticalPath={criticalPathIds.has(row.id)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <TaskFormDialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen} projectId={projectId} task={editingTask} members={members} tasks={tasks} items={items.map(i => ({ id: i.id, item_code: i.item_code, description: i.description }))} />
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete "{taskToDelete?.title}"? This cannot be undone.</AlertDialogDescription>
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
