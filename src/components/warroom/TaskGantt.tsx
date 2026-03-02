import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { differenceInDays, parseISO, format, addDays, isBefore, isAfter, startOfMonth, endOfMonth, addMonths, startOfWeek, addWeeks } from 'date-fns';
import { Plus, ZoomIn, ZoomOut, Edit, Trash2, GripVertical, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useProjectTasks, useDeleteTask, useUpdateTask, ProjectTask } from '@/hooks/useTasks';
import { TaskFormDialog } from './TaskFormDialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

const MACRO_AREA_COLORS: Record<string, string> = {
  planning: 'bg-blue-500/70',
  design_validation: 'bg-cyan-500/70',
  procurement: 'bg-amber-500/70',
  production: 'bg-indigo-500/70',
  delivery: 'bg-purple-500/70',
  installation: 'bg-emerald-500/70',
  closing: 'bg-rose-500/70',
  custom: 'bg-muted-foreground/50',
};

const MACRO_AREA_LABELS: Record<string, string> = {
  planning: 'Planning',
  design_validation: 'Design',
  procurement: 'Procurement',
  production: 'Production',
  delivery: 'Delivery',
  installation: 'Installation',
  closing: 'Closing',
  custom: 'Custom',
};

const STATUS_ICONS: Record<string, { color: string; label: string }> = {
  todo: { color: 'bg-muted-foreground', label: 'To Do' },
  in_progress: { color: 'bg-primary', label: 'In Progress' },
  done: { color: 'bg-status-safe', label: 'Done' },
  blocked: { color: 'bg-status-unsafe', label: 'Blocked' },
};

type ZoomLevel = 'day' | 'week' | 'month';

interface TaskGanttProps {
  projectId: string;
  projectStartDate: string;
  projectEndDate: string;
  members?: { id: string; display_name: string | null; email: string | null }[];
}

export function TaskGantt({ projectId, projectStartDate, projectEndDate, members = [] }: TaskGanttProps) {
  const { data: tasks = [], isLoading } = useProjectTasks(projectId);
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();

  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<ProjectTask | null>(null);

  // Group tasks by macro_area
  const groupedTasks = useMemo(() => {
    const groups: Record<string, ProjectTask[]> = {};
    tasks.forEach(t => {
      if (!groups[t.macro_area]) groups[t.macro_area] = [];
      groups[t.macro_area].push(t);
    });
    // Sort groups by predefined order
    const order = ['planning', 'design_validation', 'procurement', 'production', 'delivery', 'installation', 'closing', 'custom'];
    const sorted: { area: string; tasks: ProjectTask[] }[] = [];
    order.forEach(a => {
      if (groups[a]) sorted.push({ area: a, tasks: groups[a] });
    });
    return sorted;
  }, [tasks]);

  // Flat task list for rendering
  const flatTasks = useMemo(() => groupedTasks.flatMap(g => g.tasks), [groupedTasks]);

  // Timeline
  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    let earliest = parseISO(projectStartDate);
    let latest = parseISO(projectEndDate);
    tasks.forEach(t => {
      if (t.start_date) { const d = parseISO(t.start_date); if (isBefore(d, earliest)) earliest = d; }
      if (t.end_date) { const d = parseISO(t.end_date); if (isAfter(d, latest)) latest = d; }
    });
    const start = addDays(earliest, -7);
    const end = addDays(latest, 14);
    return { timelineStart: start, timelineEnd: end, totalDays: differenceInDays(end, start) };
  }, [tasks, projectStartDate, projectEndDate]);

  // Column headers
  const columns = useMemo(() => {
    const cols: { label: string; startDay: number; widthDays: number }[] = [];
    let cursor = timelineStart;
    while (isBefore(cursor, timelineEnd)) {
      let label: string;
      let nextCursor: Date;
      if (zoom === 'day') {
        label = format(cursor, 'dd');
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
      if (widthDays > 0) cols.push({ label, startDay, widthDays });
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

  const getMemberName = (id: string | null) => {
    if (!id) return '';
    const m = members.find(m => m.id === id);
    return m?.display_name || m?.email?.split('@')[0] || '';
  };

  const ROW_H = 36;
  const LEFT_W = 420;

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-elevated">
        <div>
          <h3 className="font-semibold text-foreground">Project Timeline</h3>
          <p className="text-xs text-muted-foreground">{tasks.length} tasks</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Legend */}
          <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground mr-2">
            {Object.entries(MACRO_AREA_LABELS).slice(0, 5).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1 mr-2">
                <span className={cn('w-3 h-2 rounded-sm', MACRO_AREA_COLORS[k])} />
                {v}
              </span>
            ))}
          </div>
          {/* Zoom */}
          <div className="flex items-center border border-border rounded-md">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setZoom(z => z === 'month' ? 'week' : 'day')}>
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs px-2 border-x border-border text-muted-foreground min-w-[50px] text-center capitalize">{zoom}</span>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setZoom(z => z === 'day' ? 'week' : 'month')}>
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
          </div>
          <Button size="sm" onClick={() => { setEditingTask(null); setTaskDialogOpen(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Task
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground text-sm">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground mb-3">No tasks yet. Create your first task to build the project timeline.</p>
          <Button variant="outline" size="sm" onClick={() => { setEditingTask(null); setTaskDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add Task
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: LEFT_W + 600 }}>
            {/* Column headers */}
            <div className="flex border-b border-border bg-muted/30">
              {/* Left panel header */}
              <div className="flex items-center border-r border-border" style={{ width: LEFT_W, minWidth: LEFT_W }}>
                <span className="text-[10px] font-medium text-muted-foreground px-3 w-[180px]">Task</span>
                <span className="text-[10px] font-medium text-muted-foreground px-2 w-[80px]">Assignee</span>
                <span className="text-[10px] font-medium text-muted-foreground px-2 w-[70px]">Status</span>
                <span className="text-[10px] font-medium text-muted-foreground px-2 w-[90px]">Dates</span>
              </div>
              {/* Calendar header */}
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
                  className="absolute top-0 bottom-0 w-px bg-destructive/60 z-10"
                  style={{ left: `calc(${LEFT_W}px + (100% - ${LEFT_W}px) * ${todayPercent / 100})` }}
                >
                  <span className="absolute -top-0 -translate-x-1/2 text-[9px] bg-destructive text-destructive-foreground px-1 rounded-b">Today</span>
                </div>
              )}

              {groupedTasks.map(group => (
                <div key={group.area}>
                  {/* Group header */}
                  <div className="flex items-center border-b border-border/50 bg-surface-elevated/50" style={{ height: 28 }}>
                    <div className="flex items-center gap-2 px-3" style={{ width: LEFT_W }}>
                      <span className={cn('w-2.5 h-2.5 rounded-sm', MACRO_AREA_COLORS[group.area])} />
                      <span className="text-[11px] font-semibold text-foreground">{MACRO_AREA_LABELS[group.area] || group.area}</span>
                      <span className="text-[10px] text-muted-foreground">({group.tasks.length})</span>
                    </div>
                  </div>

                  {group.tasks.map((task, idx) => {
                    const sInfo = STATUS_ICONS[task.status] || STATUS_ICONS.todo;
                    const hasBar = task.start_date && task.end_date;
                    let barLeft = 0, barWidth = 0;
                    if (hasBar) {
                      const s = differenceInDays(parseISO(task.start_date!), timelineStart);
                      const e = differenceInDays(parseISO(task.end_date!), timelineStart);
                      barLeft = dayToPercent(s);
                      barWidth = dayToPercent(Math.max(e - s, 1));
                    }

                    return (
                      <div
                        key={task.id}
                        className={cn(
                          'flex items-center border-b border-border/30 hover:bg-surface-hover transition-colors group',
                          idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/5'
                        )}
                        style={{ height: ROW_H }}
                      >
                        {/* Left panel */}
                        <div className="flex items-center border-r border-border" style={{ width: LEFT_W, minWidth: LEFT_W }}>
                          {/* Title */}
                          <div className="flex items-center gap-1 px-3 w-[180px]">
                            <button
                              onClick={() => handleStatusToggle(task)}
                              className={cn('w-3 h-3 rounded-full border-2 flex-shrink-0 transition-colors',
                                task.status === 'done' ? 'bg-status-safe border-status-safe' :
                                task.status === 'in_progress' ? 'bg-primary border-primary' :
                                task.status === 'blocked' ? 'bg-status-unsafe border-status-unsafe' :
                                'border-muted-foreground'
                              )}
                            />
                            <span className={cn('text-[11px] truncate', task.status === 'done' && 'line-through text-muted-foreground')} title={task.title}>
                              {task.title}
                            </span>
                          </div>
                          {/* Assignee */}
                          <span className="text-[10px] text-muted-foreground px-2 w-[80px] truncate">
                            {getMemberName(task.assignee_id) || '-'}
                          </span>
                          {/* Status */}
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full w-[70px] text-center',
                            task.status === 'done' ? 'bg-status-safe-bg text-status-safe' :
                            task.status === 'in_progress' ? 'bg-primary/10 text-primary' :
                            task.status === 'blocked' ? 'bg-status-unsafe-bg text-status-unsafe' :
                            'bg-muted text-muted-foreground'
                          )}>
                            {sInfo.label}
                          </span>
                          {/* Dates */}
                          <span className="text-[9px] font-mono text-muted-foreground px-2 w-[90px] truncate">
                            {task.start_date ? format(parseISO(task.start_date), 'dd/MM') : '-'}
                            {task.end_date ? ` → ${format(parseISO(task.end_date), 'dd/MM')}` : ''}
                          </span>
                        </div>

                        {/* Calendar bar */}
                        <div className="flex-1 relative h-full">
                          {hasBar && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    className={cn('absolute top-1/2 -translate-y-1/2 h-5 rounded cursor-pointer transition-opacity hover:opacity-90',
                                      MACRO_AREA_COLORS[task.macro_area]
                                    )}
                                    style={{ left: `${barLeft}%`, width: `${Math.max(barWidth, 0.5)}%`, minWidth: 6 }}
                                    onClick={() => { setEditingTask(task); setTaskDialogOpen(true); }}
                                  >
                                    {barWidth > 3 && (
                                      <span className="text-[9px] text-white/90 px-1 truncate block leading-5">{task.title}</span>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs font-medium">{task.title}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {task.start_date ? format(parseISO(task.start_date), 'dd MMM yyyy') : '?'}
                                    {task.end_date ? ` → ${format(parseISO(task.end_date), 'dd MMM yyyy')}` : ''}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {!hasBar && task.start_date && (
                            <div
                              className={cn('absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full', MACRO_AREA_COLORS[task.macro_area])}
                              style={{ left: `${dayToPercent(differenceInDays(parseISO(task.start_date), timelineStart))}%` }}
                            />
                          )}
                        </div>

                        {/* Actions (hidden until hover) */}
                        <div className="absolute right-2 hidden group-hover:flex items-center gap-0.5">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingTask(task); setTaskDialogOpen(true); }}>
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => { setTaskToDelete(task); setDeleteDialogOpen(true); }}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
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
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>Delete "{taskToDelete?.title}"? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
