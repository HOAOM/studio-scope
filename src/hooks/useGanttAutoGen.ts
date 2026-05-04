/**
 * useGanttAutoGen — Auto-generate Gantt task chains from BOQ items
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';
import { ITEM_TASK_CHAIN, addWorkingDays } from '@/lib/workflow';
import { toast } from 'sonner';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];

interface AutoGenOptions {
  projectId: string;
  items: ProjectItem[];
  projectStartDate: string;
}

export function useGanttAutoGen() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, items, projectStartDate }: AutoGenOptions) => {
      // Get existing auto-generated tasks to avoid duplicates
      const { data: existingTasks } = await supabase
        .from('project_tasks')
        .select('id, linked_item_id, macro_area, title')
        .eq('project_id', projectId);

      const existingSet = new Set(
        (existingTasks || []).map(t => `${t.linked_item_id}__${t.macro_area}`)
      );

      const tasksToCreate: Database['public']['Tables']['project_tasks']['Insert'][] = [];
      let startAnchor = new Date(projectStartDate);

      for (const item of items) {
        // Skip cancelled / on_hold items
        if (item.lifecycle_status === 'cancelled' || item.lifecycle_status === 'on_hold') continue;
        // Only active items
        if ((item as any).is_active === false) continue;

        let chainStart = new Date(startAnchor);

        for (const template of ITEM_TASK_CHAIN) {
          const key = `${item.id}__${template.macroArea}`;
          if (existingSet.has(key)) continue; // skip already created

          const taskStart = new Date(chainStart);
          const taskEnd = addWorkingDays(taskStart, template.defaultDurationDays);

          tasksToCreate.push({
            project_id: projectId,
            title: `${template.label} — ${item.item_code || item.description.slice(0, 25)}`,
            macro_area: template.macroArea,
            status: 'todo',
            start_date: taskStart.toISOString().split('T')[0],
            end_date: taskEnd.toISOString().split('T')[0],
            linked_item_id: item.id,
          });

          // Next task in chain starts after this one
          chainStart = taskEnd;
        }
      }

      if (tasksToCreate.length === 0) {
        return { created: 0 };
      }

      // Batch insert in chunks of 50
      let totalCreated = 0;
      for (let i = 0; i < tasksToCreate.length; i += 50) {
        const batch = tasksToCreate.slice(i, i + 50);
        const { error } = await supabase
          .from('project_tasks')
          .insert(batch);
        if (error) throw error;
        totalCreated += batch.length;
      }

      return { created: totalCreated };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['project-tasks', variables.projectId] });
      toast.success(`Generated ${data.created} tasks from BOQ items`);
    },
    onError: () => {
      toast.error('Failed to auto-generate tasks');
    },
  });
}

// ─────────────────────────────────────────
// Sync Gantt tasks when an item's lifecycle changes
// ─────────────────────────────────────────

/**
 * When an item's lifecycle_status reaches a milestone, mark the corresponding
 * Gantt task (if any) as done. The project_tasks table has no `template_key`
 * column, so we match by `linked_item_id` + the task `title` starting with
 * the template label from ITEM_TASK_CHAIN.
 */
export async function syncTaskFromLifecycleChange(
  projectId: string,
  itemId: string,
  newLifecycleStatus: string,
  supabaseClient: any
): Promise<void> {
  // Map: lifecycle status reached -> ITEM_TASK_CHAIN.key
  const statusToTaskKey: Record<string, string> = {
    design_ready: 'design',
    finishes_approved_hod: 'finishes',
    client_board_signed: 'client_board',
    quotation_approved_ops: 'quotation',
    payment_executed: 'po_payment',
    ready_to_ship: 'production',
    delivered_to_site: 'delivery',
    installed: 'installation',
    closed: 'closing',
  };

  const taskKey = statusToTaskKey[newLifecycleStatus];
  if (!taskKey) return;

  const template = ITEM_TASK_CHAIN.find(t => t.key === taskKey);
  if (!template) return;

  const today = new Date().toISOString().split('T')[0];

  // Find candidate tasks for this item; filter in JS by title prefix
  const { data: candidateTasks, error } = await supabaseClient
    .from('project_tasks')
    .select('id, status, title, end_date')
    .eq('project_id', projectId)
    .eq('linked_item_id', itemId);

  if (error || !candidateTasks) return;

  const match = candidateTasks.find((t: any) =>
    typeof t.title === 'string' && t.title.startsWith(template.label)
  );

  if (!match) return; // auto-gen will create it later

  await supabaseClient
    .from('project_tasks')
    .update({
      status: 'done',
      end_date: match.end_date || today,
      updated_at: new Date().toISOString(),
    })
    .eq('id', match.id);
}
