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
