/**
 * Hooks for item quotations (multi-option per item)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ItemQuotation {
  id: string;
  project_item_id: string;
  supplier: string;
  description: string | null;
  unit_price: number | null;
  total_price: number | null;
  lead_time_days: number | null;
  notes: string | null;
  status: string; // proposed | accepted | rejected
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useItemQuotations(itemId: string | undefined) {
  return useQuery({
    queryKey: ['item-quotations', itemId],
    queryFn: async () => {
      if (!itemId) return [];
      const { data, error } = await (supabase as any)
        .from('item_quotations')
        .select('*')
        .eq('project_item_id', itemId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ItemQuotation[];
    },
    enabled: !!itemId,
  });
}

export function useCreateQuotation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (q: Omit<ItemQuotation, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => {
      const { data, error } = await (supabase as any)
        .from('item_quotations')
        .insert({ ...q, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      return data as ItemQuotation;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['item-quotations', data.project_item_id] });
    },
  });
}

export function useUpdateQuotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ItemQuotation> & { id: string; project_item_id: string }) => {
      const { data, error } = await (supabase as any)
        .from('item_quotations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as ItemQuotation;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['item-quotations', data.project_item_id] });
    },
  });
}

export function useDeleteQuotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, itemId }: { id: string; itemId: string }) => {
      const { error } = await (supabase as any)
        .from('item_quotations')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return itemId;
    },
    onSuccess: (itemId) => {
      queryClient.invalidateQueries({ queryKey: ['item-quotations', itemId] });
    },
  });
}
