import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Database } from '@/integrations/supabase/types';

type Project = Database['public']['Tables']['projects']['Row'];
type ProjectInsert = Database['public']['Tables']['projects']['Insert'];
type ProjectUpdate = Database['public']['Tables']['projects']['Update'];
type ProjectItem = Database['public']['Tables']['project_items']['Row'];
type ProjectItemInsert = Database['public']['Tables']['project_items']['Insert'];
type ProjectItemUpdate = Database['public']['Tables']['project_items']['Update'];
type BOQCoverage = Database['public']['Tables']['boq_coverage']['Row'];

export function useProjects() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Project[];
    },
    enabled: !!user,
  });
}

export function useProject(projectId: string | undefined) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle();
      
      if (error) throw error;
      return data as Project | null;
    },
    enabled: !!user && !!projectId,
  });
}

/**
 * Fetch active items only.
 * Soft-deleted items (is_active = false) are excluded from all standard views.
 * Admins can recover them via useDeletedProjectItems().
 */
export function useProjectItems(projectId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['project-items', projectId],
    queryFn: async () => {
      if (!projectId) return [];

      const { data, error } = await supabase
        .from('project_items')
        .select('*')
        .eq('project_id', projectId)
        .or('is_active.is.null,is_active.eq.true')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ProjectItem[];
    },
    enabled: !!user && !!projectId,
  });
}

/**
 * Fetch soft-deleted items (admin recovery view).
 */
export function useDeletedProjectItems(projectId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['project-items-deleted', projectId],
    queryFn: async () => {
      if (!projectId) return [];

      const { data, error } = await supabase
        .from('project_items')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_active', false)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data as ProjectItem[];
    },
    enabled: !!user && !!projectId,
  });
}

/**
 * Restore a soft-deleted item.
 */
export function useRestoreProjectItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const { error } = await supabase
        .from('project_items')
        .update({ is_active: true })
        .eq('id', id);
      if (error) throw error;
      return projectId;
    },
    onSuccess: (projectId) => {
      queryClient.invalidateQueries({ queryKey: ['project-items', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-items-deleted', projectId] });
    },
  });
}

export function useBOQCoverage(projectId: string | undefined) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['boq-coverage', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      
      const { data, error } = await supabase
        .from('boq_coverage')
        .select('*')
        .eq('project_id', projectId);
      
      if (error) throw error;
      return data as BOQCoverage[];
    },
    enabled: !!user && !!projectId,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (project: Omit<ProjectInsert, 'owner_id'>) => {
      if (!user) throw new Error('Must be logged in');
      
      const { data, error } = await supabase
        .from('projects')
        .insert({ ...project, owner_id: user.id })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: ProjectUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', data.id] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useCreateProjectItem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (item: ProjectItemInsert) => {
      const { data, error } = await supabase
        .from('project_items')
        .insert(item)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project-items', data.project_id] });
    },
  });
}

export function useUpdateProjectItem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: ProjectItemUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('project_items')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project-items', data.project_id] });
    },
  });
}

/**
 * SOFT DELETE — flips is_active to false instead of dropping the row.
 * The DB cascade still applies if a hard delete is later required (admin only).
 * This prevents the kind of accidental loss that wiped item F00BD06-LFPF001.
 */
export function useDeleteProjectItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const { error } = await supabase
        .from('project_items')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;

      // Also soft-delete child options (parent_item_id = id)
      await supabase
        .from('project_items')
        .update({ is_active: false })
        .eq('parent_item_id', id);

      return projectId;
    },
    onSuccess: (projectId) => {
      queryClient.invalidateQueries({ queryKey: ['project-items', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-items-deleted', projectId] });
    },
  });
}

/**
 * HARD DELETE — Admin only. Permanently removes the row from DB.
 * Cascades to child options via FK constraint.
 * Use only for true cleanup (test data, mistakes the same day).
 */
export function useHardDeleteProjectItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const { error } = await supabase
        .from('project_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return projectId;
    },
    onSuccess: (projectId) => {
      queryClient.invalidateQueries({ queryKey: ['project-items', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-items-deleted', projectId] });
    },
  });
}

export function useBulkCreateProjectItems() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (items: ProjectItemInsert[]) => {
      const { data, error } = await supabase
        .from('project_items')
        .insert(items)
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['project-items', data[0].project_id] });
      }
    },
  });
}
