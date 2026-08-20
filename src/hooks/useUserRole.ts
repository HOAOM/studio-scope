import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveOrg } from '@/hooks/useMyOrganizations';
import { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

// Roles that can see cost/pricing data
const COST_VISIBLE_ROLES: AppRole[] = ['admin', 'accountant', 'qs', 'head_of_payments', 'ceo'];

export function useUserRole() {
  const { user } = useAuth();
  const { activeId, isLoading: orgLoading } = useActiveOrg();

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['user_roles_self', user?.id, activeId],
    queryFn: async () => {
      if (!user || !activeId) return [];
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('organization_id', activeId);
      if (error) return [];
      return data.map((r) => r.role);
    },
    enabled: !!user && !!activeId,
  });

  const canSeeCosts = roles.some((r) => COST_VISIBLE_ROLES.includes(r));

  return { roles, canSeeCosts, isLoading: isLoading || orgLoading };
}
