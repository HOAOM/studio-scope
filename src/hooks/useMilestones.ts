/**
 * Hooks for COO project milestones
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ProjectMilestone {
  id: string;
  project_id: string;
  target_date: string;
  label: string;
  required_status: string;
  macro_area: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useProjectMilestones(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-milestones', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await (supabase as any)
        .from('project_milestones')
        .select('*')
        .eq('project_id', projectId)
        .order('target_date', { ascending: true });
      if (error) throw error;
      return (data || []) as ProjectMilestone[];
    },
    enabled: !!projectId,
  });
}

export function useCreateMilestone() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (m: Omit<ProjectMilestone, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => {
      const { data, error } = await (supabase as any)
        .from('project_milestones')
        .insert({ ...m, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      return data as ProjectMilestone;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project-milestones', data.project_id] });
    },
  });
}

export function useDeleteMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const { error } = await (supabase as any)
        .from('project_milestones')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return projectId;
    },
    onSuccess: (projectId) => {
      queryClient.invalidateQueries({ queryKey: ['project-milestones', projectId] });
    },
  });
}
