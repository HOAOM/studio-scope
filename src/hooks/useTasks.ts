import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ProjectTask {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  macro_area: string;
  status: string;
  assignee_id: string | null;
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
  linked_item_id: string | null;
  depends_on: string | null;
  completion_fields: string[] | null;
  created_at: string;
  updated_at: string;
}

export function useProjectTasks(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-tasks', projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('project_tasks')
        .select('*')
        .eq('project_id', projectId!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as ProjectTask[];
    },
    enabled: !!projectId,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task: Partial<ProjectTask> & { project_id: string; title: string }) => {
      const { data, error } = await (supabase as any)
        .from('project_tasks')
        .insert(task)
        .select()
        .single();
      if (error) throw error;
      return data as ProjectTask;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['project-tasks', vars.project_id] });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId, ...updates }: { id: string; projectId: string } & Partial<ProjectTask>) => {
      const { data, error } = await (supabase as any)
        .from('project_tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ProjectTask;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['project-tasks', vars.projectId] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const { error } = await (supabase as any)
        .from('project_tasks')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['project-tasks', vars.projectId] });
    },
  });
}
