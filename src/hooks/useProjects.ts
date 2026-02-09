import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ProjectItem[];
    },
    enabled: !!user && !!projectId,
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

export function useDeleteProjectItem() {
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
