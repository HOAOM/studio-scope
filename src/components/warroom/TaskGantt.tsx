import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { differenceInDays, parseISO, format, addDays, isBefore, isAfter } from 'date-fns';
import { Plus, ZoomIn, ZoomOut, Edit, Trash2, ChevronDown, ChevronRight, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useProjectTasks, useDeleteTask, useUpdateTask, ProjectTask } from '@/hooks/useTasks';
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
  phases?: { key: string; label: string; color: string; start: string; end: string | null }[];
  task?: ProjectTask;
}

/* ── Constants ── */
const GROUP_ORDER = ['planning', 'design_validation', 'procurement', 'production', 'delivery', 'installation', 'closing', 'custom', 'items_joinery', 'items_loose-furniture', 'items_lighting', 'items_finishes', 'items_ffe', 'items_accessories', 'items_appliances'];

const GROUP_LABELS: Record<string, string> = {
  planning: 'Planning & Prep',
  design_validation: 'Design Validation',
  procurement: 'Procurement',
  production: 'Production',
  delivery: 'Delivery',
  installation: 'Installation',
  closing: 'Closing',
  custom: 'Custom',
  items_joinery: '📦 Joinery Items',
  'items_loose-furniture': '📦 Loose Furniture',
  items_lighting: '📦 Lighting Items',
  items_finishes: '📦 Finishes Items',
  items_ffe: '📦 FF&E Items',
  items_accessories: '📦 Accessories Items',
  items_appliances: '📦 Appliances Items',
};

const GROUP_COLORS: Record<string, string> = {
  planning: 'bg-blue-500',
  design_validation: 'bg-cyan-500',
  procurement: 'bg-amber-500',
  production: 'bg-indigo-500',
  delivery: 'bg-purple-500',
  installation: 'bg-emerald-500',
  closing: 'bg-rose-500',
  custom: 'bg-muted-foreground',
  items_joinery: 'bg-orange-500',
  'items_loose-furniture': 'bg-teal-500',
  items_lighting: 'bg-yellow-500',
  items_finishes: 'bg-pink-500',
  items_ffe: 'bg-lime-500',
  items_accessories: 'bg-sky-500',
  items_appliances: 'bg-red-500',
};

const ITEM_PHASE_COLORS: Record<string, string> = {
  production: 'bg-indigo-500/70',
  transit: 'bg-amber-500/70',
  site: 'bg-purple-500/70',
  install: 'bg-emerald-500/70',
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  todo: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'To Do' },
  in_progress: { bg: 'bg-primary/10', text: 'text-primary', label: 'In Progress' },
  done: { bg: 'bg-status-safe-bg', text: 'text-status-safe', label: 'Done' },
  blocked: { bg: 'bg-status-unsafe-bg', text: 'text-status-unsafe', label: 'Blocked' },
  draft: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Draft' },
  estimated: { bg: 'bg-status-at-risk-bg', text: 'text-status-at-risk', label: 'Estimated' },
  approved: { bg: 'bg-status-safe-bg', text: 'text-status-safe', label: 'Approved' },
  ordered: { bg: 'bg-primary/10', text: 'text-primary', label: 'Ordered' },
  delivered: { bg: 'bg-status-safe-bg', text: 'text-status-safe', label: 'Delivered' },
  installed: { bg: 'bg-status-safe-bg', text: 'text-status-safe', label: 'Installed' },
  on_hold: { bg: 'bg-status-unsafe-bg', text: 'text-status-unsafe', label: 'On Hold' },
};

type ZoomLevel = 'day' | 'week' | 'month';

interface TaskGanttProps {
  projectId: string;
  projectStartDate: string;
  projectEndDate: string;
  items?: ProjectItem[];
  members?: { id: string; display_name: string | null; email: string | null }[];
}

/* ── Convert items to GanttRows ── */
function itemsToRows(items: ProjectItem[]): GanttRow[] {
  return items
    .filter(item => item.production_due_date || item.delivery_date || item.site_movement_date || item.installation_start_date || item.installed_date)
    .map(item => {
      const phases: GanttRow['phases'] = [];
      if (item.production_due_date) {
        phases.push({ key: 'production', label: 'Production', color: ITEM_PHASE_COLORS.production, start: item.production_due_date, end: item.delivery_date });
      }
      if (item.delivery_date) {
        phases.push({ key: 'transit', label: 'Transit', color: ITEM_PHASE_COLORS.transit, start: item.delivery_date, end: item.received_date || item.site_movement_date });
      }
      if (item.site_movement_date) {
        phases.push({ key: 'site', label: 'Site Move', color: ITEM_PHASE_COLORS.site, start: item.site_movement_date, end: item.installation_start_date });
      }
      if (item.installation_start_date) {
        phases.push({ key: 'install', label: 'Install', color: ITEM_PHASE_COLORS.install, start: item.installation_start_date, end: item.installed_date });
      }

      // Overall date range
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
        phases,
      };
    });
}

export function TaskGantt({ projectId, projectStartDate, projectEndDate, items = [], members = [] }: TaskGanttProps) {
  const { data: tasks = [], isLoading } = useProjectTasks(projectId);
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();

  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<ProjectTask | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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
      task: t,
    }));
    const itemRows = itemsToRows(items);
    return [...taskRows, ...itemRows];
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
    // Any remaining groups
    Object.keys(groups).forEach(g => {
      if (!GROUP_ORDER.includes(g) && groups[g].length) sorted.push({ group: g, rows: groups[g] });
    });
    return sorted;
  }, [allRows]);

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

  const ROW_H = 34;
  const LEFT_W = 440;

  const totalRows = groupedRows.reduce((sum, g) => {
    const headerCount = 1;
    const rowCount = collapsedGroups.has(g.group) ? 0 : g.rows.length;
    return sum + headerCount + rowCount;
  }, 0);

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-elevated">
        <div>
          <h3 className="font-semibold text-foreground">Project Timeline</h3>
          <p className="text-xs text-muted-foreground">
            {tasks.length} tasks · {allRows.filter(r => r.type === 'item').length} items with dates
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Phase legend for items */}
          <div className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground mr-2">
            {Object.entries(ITEM_PHASE_COLORS).map(([k, c]) => (
              <span key={k} className="flex items-center gap-1 mr-2">
                <span className={cn('w-3 h-2 rounded-sm', c)} />
                {k === 'transit' ? 'Transit' : k === 'install' ? 'Install' : k === 'site' ? 'Site' : 'Prod'}
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
        <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
      ) : allRows.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground mb-3">No tasks or items with dates. Create a task or add dates to items.</p>
          <Button variant="outline" size="sm" onClick={() => { setEditingTask(null); setTaskDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add Task
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: LEFT_W + 600 }}>
            {/* Column headers */}
            <div className="flex border-b border-border bg-muted/30">
              <div className="flex items-center border-r border-border" style={{ width: LEFT_W, minWidth: LEFT_W }}>
                <span className="text-[10px] font-medium text-muted-foreground px-3 w-[200px]">Name</span>
                <span className="text-[10px] font-medium text-muted-foreground px-2 w-[70px]">Assignee</span>
                <span className="text-[10px] font-medium text-muted-foreground px-2 w-[75px]">Status</span>
                <span className="text-[10px] font-medium text-muted-foreground px-2 w-[95px]">Dates</span>
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
                  className="absolute top-0 bottom-0 w-px bg-destructive/60 z-10"
                  style={{ left: `calc(${LEFT_W}px + (100% - ${LEFT_W}px) * ${todayPercent / 100})` }}
                >
                  <span className="absolute -top-0 -translate-x-1/2 text-[9px] bg-destructive text-destructive-foreground px-1 rounded-b">Today</span>
                </div>
              )}

              {groupedRows.map(({ group, rows }) => {
                const isCollapsed = collapsedGroups.has(group);
                const isItemGroup = group.startsWith('items_');
                return (
                  <div key={group}>
                    {/* Group header */}
                    <button
                      onClick={() => toggleGroup(group)}
                      className="w-full flex items-center border-b border-border/50 bg-surface-elevated/50 hover:bg-surface-hover transition-colors"
                      style={{ height: 30 }}
                    >
                      <div className="flex items-center gap-2 px-3" style={{ width: LEFT_W }}>
                        {isCollapsed ? <ChevronRight className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                        <span className={cn('w-2.5 h-2.5 rounded-sm', GROUP_COLORS[group] || 'bg-muted-foreground')} />
                        <span className="text-[11px] font-semibold text-foreground">{GROUP_LABELS[group] || group}</span>
                        <span className="text-[10px] text-muted-foreground">({rows.length})</span>
                      </div>
                    </button>

                    {!isCollapsed && rows.map((row, idx) => {
                      const sStyle = STATUS_STYLES[row.status] || STATUS_STYLES.todo;

                      return (
                        <div
                          key={row.id}
                          className={cn(
                            'flex items-center border-b border-border/30 hover:bg-surface-hover transition-colors group/row',
                            idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/5'
                          )}
                          style={{ height: ROW_H }}
                        >
                          {/* Left panel */}
                          <div className="flex items-center border-r border-border" style={{ width: LEFT_W, minWidth: LEFT_W }}>
                            <div className="flex items-center gap-1.5 px-3 w-[200px]">
                              {row.type === 'task' && row.task ? (
                                <button
                                  onClick={() => handleStatusToggle(row.task!)}
                                  className={cn('w-3 h-3 rounded-full border-2 flex-shrink-0 transition-colors',
                                    row.status === 'done' ? 'bg-status-safe border-status-safe' :
                                    row.status === 'in_progress' ? 'bg-primary border-primary' :
                                    row.status === 'blocked' ? 'bg-status-unsafe border-status-unsafe' :
                                    'border-muted-foreground'
                                  )}
                                />
                              ) : (
                                <Package className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                              )}
                              <span className={cn('text-[11px] truncate', row.status === 'done' && 'line-through text-muted-foreground')} title={row.sublabel || row.label}>
                                {row.type === 'item' && row.label !== row.sublabel ? (
                                  <span className="font-mono text-primary mr-1">{row.label}</span>
                                ) : null}
                                {row.type === 'item' ? (row.sublabel || row.label) : row.label}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground px-2 w-[70px] truncate">
                              {getMemberName(row.assignee) || '-'}
                            </span>
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full w-[75px] text-center truncate', sStyle.bg, sStyle.text)}>
                              {sStyle.label}
                            </span>
                            <span className="text-[9px] font-mono text-muted-foreground px-2 w-[95px] truncate">
                              {row.startDate ? format(parseISO(row.startDate), 'dd/MM') : '-'}
                              {row.endDate ? ` → ${format(parseISO(row.endDate), 'dd/MM')}` : ''}
                            </span>
                          </div>

                          {/* Calendar bars */}
                          <div className="flex-1 relative h-full">
                            {row.type === 'task' ? (
                              /* Single bar for tasks */
                              row.startDate && row.endDate ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div
                                        className={cn('absolute top-1/2 -translate-y-1/2 h-[18px] rounded cursor-pointer hover:opacity-90',
                                          GROUP_COLORS[row.group] || 'bg-muted-foreground'
                                        )}
                                        style={{
                                          left: `${dayToPercent(differenceInDays(parseISO(row.startDate), timelineStart))}%`,
                                          width: `${Math.max(dayToPercent(differenceInDays(parseISO(row.endDate), parseISO(row.startDate))), 0.5)}%`,
                                          minWidth: 6,
                                        }}
                                        onClick={() => { if (row.task) { setEditingTask(row.task); setTaskDialogOpen(true); } }}
                                      >
                                        <span className="text-[9px] text-white/90 px-1 truncate block leading-[18px]">{row.label}</span>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs font-medium">{row.label}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {format(parseISO(row.startDate), 'dd MMM yyyy')} → {format(parseISO(row.endDate), 'dd MMM yyyy')}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : row.startDate ? (
                                <div
                                  className={cn('absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full', GROUP_COLORS[row.group])}
                                  style={{ left: `${dayToPercent(differenceInDays(parseISO(row.startDate), timelineStart))}%` }}
                                />
                              ) : null
                            ) : (
                              /* Multi-phase bars for items */
                              row.phases?.map(phase => {
                                const s = differenceInDays(parseISO(phase.start), timelineStart);
                                const e = phase.end ? differenceInDays(parseISO(phase.end), timelineStart) : s + 3;
                                const left = dayToPercent(s);
                                const width = dayToPercent(Math.max(e - s, 1));
                                return (
                                  <TooltipProvider key={phase.key}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div
                                          className={cn('absolute top-1/2 -translate-y-1/2 h-[16px] rounded-sm cursor-default', phase.color)}
                                          style={{ left: `${left}%`, width: `${Math.max(width, 0.3)}%`, minWidth: 4 }}
                                        />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs font-medium">{phase.label}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {format(parseISO(phase.start), 'dd MMM yyyy')}
                                          {phase.end ? ` → ${format(parseISO(phase.end), 'dd MMM yyyy')}` : ''}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })
                            )}
                          </div>

                          {/* Hover actions for tasks only */}
                          {row.type === 'task' && row.task && (
                            <div className="absolute right-2 hidden group-hover/row:flex items-center gap-0.5">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingTask(row.task!); setTaskDialogOpen(true); }}>
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => { setTaskToDelete(row.task!); setDeleteDialogOpen(true); }}>
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
