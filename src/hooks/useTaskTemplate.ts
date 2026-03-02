import { useMemo, useCallback } from 'react';
import { useProjectTasks, useCreateTask, useUpdateTask, ProjectTask } from '@/hooks/useTasks';
import { Database } from '@/integrations/supabase/types';
import { toast } from 'sonner';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];
type TaskMacroArea = Database['public']['Enums']['task_macro_area'];

interface TemplateTask {
  title: string;
  macro_area: TaskMacroArea;
  description: string;
}

const TASK_TEMPLATE: TemplateTask[] = [
  { title: 'Define BOQ Scope', macro_area: 'planning', description: 'Define complete scope of items per area and category' },
  { title: 'Floor Plan Review', macro_area: 'planning', description: 'Review and confirm floor plans with client' },
  { title: 'Finishes Selection', macro_area: 'design_validation', description: 'Select materials, colors and finishes for all items' },
  { title: 'Design Approval (Client)', macro_area: 'design_validation', description: 'Client reviews and approves all design selections' },
  { title: 'Supplier Quotation', macro_area: 'procurement', description: 'Collect and compare supplier quotes' },
  { title: 'PO Submission', macro_area: 'procurement', description: 'Submit purchase orders for approved items' },
  { title: 'Production Tracking', macro_area: 'production', description: 'Monitor production progress and due dates' },
  { title: 'Quality Check', macro_area: 'production', description: 'Verify production quality before shipment' },
  { title: 'Delivery Coordination', macro_area: 'delivery', description: 'Coordinate logistics and delivery scheduling' },
  { title: 'Site Receiving', macro_area: 'delivery', description: 'Receive and inspect deliveries on site' },
  { title: 'Site Preparation', macro_area: 'installation', description: 'Prepare areas for installation' },
  { title: 'Installation Supervision', macro_area: 'installation', description: 'Supervise installation and resolve issues' },
  { title: 'Final Inspection', macro_area: 'closing', description: 'Complete final inspection and punch list' },
  { title: 'Client Handover', macro_area: 'closing', description: 'Formal handover documentation and walkthrough' },
];

/** Derive suggested dates for template tasks based on item data */
function deriveTaskDates(
  task: TemplateTask,
  items: ProjectItem[],
  projectStart: string,
  projectEnd: string
): { start_date: string | null; end_date: string | null } {
  const allDates = (field: keyof ProjectItem) =>
    items.map(i => i[field] as string | null).filter(Boolean).sort() as string[];

  switch (task.macro_area) {
    case 'planning':
      return { start_date: projectStart, end_date: null };
    case 'design_validation': {
      const pending = items.filter(i => i.approval_status === 'pending' || i.approval_status === 'revision');
      return { start_date: projectStart, end_date: pending.length === 0 ? new Date().toISOString().split('T')[0] : null };
    }
    case 'procurement': {
      const prodDates = allDates('production_due_date');
      return { start_date: prodDates[0] || null, end_date: null };
    }
    case 'production': {
      const prodDates = allDates('production_due_date');
      const delDates = allDates('delivery_date');
      return { start_date: prodDates[0] || null, end_date: delDates[delDates.length - 1] || null };
    }
    case 'delivery': {
      const delDates = allDates('delivery_date');
      const recDates = allDates('received_date');
      return { start_date: delDates[0] || null, end_date: recDates[recDates.length - 1] || null };
    }
    case 'installation': {
      const instStart = allDates('installation_start_date');
      const instEnd = allDates('installed_date');
      return { start_date: instStart[0] || null, end_date: instEnd[instEnd.length - 1] || null };
    }
    case 'closing':
      return { start_date: null, end_date: projectEnd };
    default:
      return { start_date: null, end_date: null };
  }
}

/** Derive task status from item data */
function deriveTaskStatus(
  task: TemplateTask,
  items: ProjectItem[]
): 'todo' | 'in_progress' | 'done' {
  if (items.length === 0) return 'todo';

  switch (task.macro_area) {
    case 'planning':
      return items.length > 0 ? 'done' : 'todo';
    case 'design_validation': {
      const approved = items.filter(i => i.approval_status === 'approved').length;
      if (approved === items.length) return 'done';
      if (approved > 0) return 'in_progress';
      return 'todo';
    }
    case 'procurement': {
      const ordered = items.filter(i => i.purchased).length;
      if (ordered === items.length) return 'done';
      if (ordered > 0) return 'in_progress';
      return 'todo';
    }
    case 'production': {
      const withProd = items.filter(i => i.production_due_date);
      const delivered = items.filter(i => i.delivery_date).length;
      if (withProd.length > 0 && delivered === withProd.length) return 'done';
      if (delivered > 0) return 'in_progress';
      return 'todo';
    }
    case 'delivery': {
      const received = items.filter(i => i.received).length;
      const ordered = items.filter(i => i.purchased).length;
      if (ordered > 0 && received === ordered) return 'done';
      if (received > 0) return 'in_progress';
      return 'todo';
    }
    case 'installation': {
      const installed = items.filter(i => i.installed).length;
      const received = items.filter(i => i.received).length;
      if (received > 0 && installed === received) return 'done';
      if (installed > 0) return 'in_progress';
      return 'todo';
    }
    case 'closing': {
      const allInstalled = items.every(i => i.installed);
      return allInstalled ? 'in_progress' : 'todo';
    }
    default:
      return 'todo';
  }
}

export function useTaskTemplate(projectId: string | undefined, items: ProjectItem[], projectStart: string, projectEnd: string) {
  const { data: existingTasks = [] } = useProjectTasks(projectId);
  const createTask = useCreateTask();
  const updateTaskMutation = useUpdateTask();

  /** Check which template tasks are missing */
  const missingTasks = useMemo(() => {
    return TASK_TEMPLATE.filter(tmpl =>
      !existingTasks.some(t => t.title === tmpl.title && t.macro_area === tmpl.macro_area)
    );
  }, [existingTasks]);

  /** Compute auto-sync suggestions: what existing tasks should update */
  const syncSuggestions = useMemo(() => {
    return existingTasks
      .filter(t => TASK_TEMPLATE.some(tmpl => tmpl.title === t.title && tmpl.macro_area === t.macro_area))
      .map(t => {
        const tmpl = TASK_TEMPLATE.find(tmpl => tmpl.title === t.title && tmpl.macro_area === t.macro_area)!;
        const derived = deriveTaskDates(tmpl, items, projectStart, projectEnd);
        const derivedStatus = deriveTaskStatus(tmpl, items);
        return {
          task: t,
          suggestedStart: derived.start_date,
          suggestedEnd: derived.end_date,
          suggestedStatus: derivedStatus,
          needsUpdate: (
            (derived.start_date && derived.start_date !== t.start_date) ||
            (derived.end_date && derived.end_date !== t.end_date) ||
            (derivedStatus !== t.status)
          ),
        };
      })
      .filter(s => s.needsUpdate);
  }, [existingTasks, items, projectStart, projectEnd]);

  const generateTemplateTasks = useCallback(async () => {
    if (!projectId) return;
    let created = 0;
    for (const tmpl of missingTasks) {
      const dates = deriveTaskDates(tmpl, items, projectStart, projectEnd);
      const status = deriveTaskStatus(tmpl, items);
      try {
        await createTask.mutateAsync({
          project_id: projectId,
          title: tmpl.title,
          macro_area: tmpl.macro_area,
          description: tmpl.description,
          status,
          start_date: dates.start_date,
          end_date: dates.end_date,
        } as any);
        created++;
      } catch (e) {
        console.error('Failed to create template task:', tmpl.title, e);
      }
    }
    toast.success(`${created} template tasks generated`);
  }, [projectId, missingTasks, items, projectStart, projectEnd, createTask]);

  /** Apply sync suggestions — update dates & status from item data */
  const syncTasks = useCallback(async () => {
    if (!projectId || syncSuggestions.length === 0) return;
    let synced = 0;
    for (const s of syncSuggestions) {
      try {
        const updates: Record<string, any> = {};
        if (s.suggestedStart && s.suggestedStart !== s.task.start_date) updates.start_date = s.suggestedStart;
        if (s.suggestedEnd && s.suggestedEnd !== s.task.end_date) updates.end_date = s.suggestedEnd;
        if (s.suggestedStatus !== s.task.status) updates.status = s.suggestedStatus;
        if (Object.keys(updates).length > 0) {
          await updateTaskMutation.mutateAsync({ id: s.task.id, projectId, ...updates } as any);
          synced++;
        }
      } catch (e) {
        console.error('Failed to sync task:', s.task.title, e);
      }
    }
    toast.success(`${synced} tasks synced with item data`);
  }, [projectId, syncSuggestions, updateTaskMutation]);

  return {
    missingTasks,
    syncSuggestions,
    generateTemplateTasks,
    syncTasks,
    hasTemplate: existingTasks.some(t => TASK_TEMPLATE.some(tmpl => tmpl.title === t.title)),
    templateTaskCount: TASK_TEMPLATE.length,
    isGenerating: createTask.isPending,
    isSyncing: updateTaskMutation.isPending,
  };
}

export { TASK_TEMPLATE, deriveTaskDates, deriveTaskStatus };
