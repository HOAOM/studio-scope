import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Supplier {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  categories: string[];
  rating: number;
  notes: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierComment {
  id: string;
  supplier_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

const sb = supabase as any;

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await sb.from('suppliers').select('*').order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as Supplier[];
    },
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  const { activeId } = useActiveOrg();
  return useMutation({
    mutationFn: async (input: Partial<Supplier>) => {
      if (!activeId) throw new Error('Nessuna organizzazione attiva');
      const { data: userData } = await supabase.auth.getUser();
      const payload = { ...input, created_by: userData.user?.id, organization_id: activeId };
      const { data, error } = await sb.from('suppliers').insert(payload).select().single();
      if (error) throw error;
      return data as Supplier;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Fornitore creato');
    },
    onError: (e: any) => toast.error(e.message || 'Errore creazione fornitore'),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Supplier> & { id: string }) => {
      const { data, error } = await sb.from('suppliers').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data as Supplier;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Fornitore aggiornato');
    },
    onError: (e: any) => toast.error(e.message || 'Errore aggiornamento'),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from('suppliers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Fornitore eliminato');
    },
    onError: (e: any) => toast.error(e.message || 'Errore eliminazione'),
  });
}

export function useSupplierComments(supplierId: string | undefined) {
  return useQuery({
    queryKey: ['supplier-comments', supplierId],
    enabled: !!supplierId,
    queryFn: async () => {
      const { data, error } = await sb
        .from('supplier_comments')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as SupplierComment[];
    },
  });
}

export function useAddSupplierComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ supplier_id, body }: { supplier_id: string; body: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await sb
        .from('supplier_comments')
        .insert({ supplier_id, body, author_id: userData.user?.id })
        .select()
        .single();
      if (error) throw error;
      return data as SupplierComment;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['supplier-comments', vars.supplier_id] });
    },
    onError: (e: any) => toast.error(e.message || 'Errore commento'),
  });
}
