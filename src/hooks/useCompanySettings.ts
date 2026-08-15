import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveOrg } from '@/hooks/useMyOrganizations';

export interface CompanySettings {
  id: string;
  organization_id: string;
  company_name: string;
  company_address: string;
  logo_url: string;
  phone: string;
  email: string;
  website: string;
  contact_email?: string;
  export_template?: string;
  onboarding_completed?: boolean;
  vat_number: string;
}

/**
 * Impostazioni azienda della organizzazione indicata.
 * Se `orgId` non è passato si usa l'organizzazione attiva dell'utente.
 * Per gli export passare SEMPRE `project.organization_id`, così l'intestazione
 * di PDF/Excel appartiene allo studio proprietario del progetto.
 */
export function useCompanySettings(orgId?: string | null) {
  const { activeId } = useActiveOrg();
  const targetOrg = orgId ?? activeId ?? null;

  return useQuery({
    queryKey: ['company_settings', targetOrg],
    enabled: !!targetOrg,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('company_settings')
        .select('*')
        .eq('organization_id', targetOrg)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CompanySettings | null;
    },
  });
}

export function useUpdateCompanySettings(orgId?: string | null) {
  const queryClient = useQueryClient();
  const { activeId } = useActiveOrg();
  const targetOrg = orgId ?? activeId ?? null;

  return useMutation({
    mutationFn: async (updates: Partial<CompanySettings>) => {
      if (!targetOrg) throw new Error('Nessuna organizzazione attiva');
      const { data: existing } = await (supabase as any)
        .from('company_settings')
        .select('id')
        .eq('organization_id', targetOrg)
        .maybeSingle();

      if (existing) {
        const { error } = await (supabase as any)
          .from('company_settings')
          .update(updates)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('company_settings')
          .insert({ ...updates, organization_id: targetOrg });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company_settings'] });
    },
  });
}
