import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CompanySettings {
  id: string;
  company_name: string;
  company_address: string;
  logo_url: string;
  phone: string;
  email: string;
  website: string;
  vat_number: string;
}

export function useCompanySettings() {
  return useQuery({
    queryKey: ['company_settings'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('company_settings')
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      return data as CompanySettings;
    },
  });
}

export function useUpdateCompanySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<CompanySettings>) => {
      // Get the single row id first
      const { data: existing } = await (supabase as any)
        .from('company_settings')
        .select('id')
        .limit(1)
        .single();
      if (!existing) throw new Error('No company settings row');
      const { error } = await (supabase as any)
        .from('company_settings')
        .update(updates)
        .eq('id', existing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company_settings'] });
    },
  });
}
