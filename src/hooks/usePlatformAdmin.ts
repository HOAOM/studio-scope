/**
 * usePlatformAdmin — tells whether the signed-in user belongs to the PLATFORM
 * staff layer (public.platform_admins), which is completely separate from the
 * per-organization client role app_role='admin'.
 *
 * The platform_admins table is not exposed to the Data API: the check goes
 * through the security-definer RPCs is_platform_admin() / is_platform_owner(),
 * which return false for every client user.
 *
 * Backed by react-query with a long staleTime so the route guard and the
 * SuperAdmin page share a single cached response instead of re-running
 * getUser + 2 RPC on every mount.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PlatformGrade = 'staff' | 'owner';

export function usePlatformAdmin() {
  const { data: grade = null, isLoading } = useQuery<PlatformGrade | null>({
    queryKey: ['platform-admin-grade'],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const [{ data: isAdmin }, { data: isOwner }] = await Promise.all([
        (supabase as any).rpc('is_platform_admin', { _user_id: auth.user.id }),
        (supabase as any).rpc('is_platform_owner', { _user_id: auth.user.id }),
      ]);
      return isOwner ? 'owner' : isAdmin ? 'staff' : null;
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
retry: false,
  });

  return {
    grade,
    isPlatformAdmin: grade !== null,
    isPlatformOwner: grade === 'owner',
    isLoading,
  };
}
