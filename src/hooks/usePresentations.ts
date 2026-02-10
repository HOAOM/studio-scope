import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface PresentationCell {
  type: 'image' | 'text' | 'empty';
  content: string;
}

export interface PresentationPage {
  id: string;
  cells: PresentationCell[];
}

export interface Presentation {
  id: string;
  project_id: string;
  name: string;
  pages_data: PresentationPage[];
  created_at: string;
  updated_at: string;
  owner_id: string;
}

// Use raw RPC/SQL since 'presentations' table is not yet in generated types
const presentationsTable = 'presentations';

export function usePresentations(projectId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['presentations', projectId],
    queryFn: async () => {
      if (!projectId) return [] as Presentation[];
      const { data, error } = await (supabase as any)
        .from(presentationsTable)
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((row: any) => ({
        ...row,
        pages_data: (row.pages_data || []) as PresentationPage[],
      })) as Presentation[];
    },
    enabled: !!user && !!projectId,
  });
}

export function useCreatePresentation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ projectId, name }: { projectId: string; name: string }) => {
      if (!user) throw new Error('Must be logged in');
      const defaultPage: PresentationPage = {
        id: crypto.randomUUID(),
        cells: Array(6).fill({ type: 'empty', content: '' }),
      };
      const { data, error } = await (supabase as any)
        .from(presentationsTable)
        .insert({
          project_id: projectId,
          name,
          owner_id: user.id,
          pages_data: [defaultPage],
        })
        .select()
        .single();
      if (error) throw error;
      return data as Presentation;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['presentations', data.project_id] });
    },
  });
}

export function useUpdatePresentation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, projectId, name, pages_data }: { id: string; projectId: string; name?: string; pages_data?: PresentationPage[] }) => {
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (pages_data !== undefined) updates.pages_data = pages_data;
      
      const { data, error } = await (supabase as any)
        .from(presentationsTable)
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return { ...(data as Presentation), project_id: projectId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['presentations', data.project_id] });
    },
  });
}

export function useDeletePresentation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const { error } = await (supabase as any)
        .from(presentationsTable)
        .delete()
        .eq('id', id);
      if (error) throw error;
      return projectId;
    },
    onSuccess: (projectId) => {
      queryClient.invalidateQueries({ queryKey: ['presentations', projectId] });
    },
  });
}
