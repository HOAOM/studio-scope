/**
 * usePlatformAdmin — tells whether the signed-in user belongs to the PLATFORM
 * staff layer (public.platform_admins), which is completely separate from the
 * per-organization client role app_role='admin'.
 *
 * The platform_admins table is not exposed to the Data API: the check goes
 * through the security-definer RPCs is_platform_admin() / is_platform_owner(),
 * which return false for every client user.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type PlatformGrade = 'staff' | 'owner';

export function usePlatformAdmin() {
  const [grade, setGrade] = useState<PlatformGrade | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (active) { setGrade(null); setIsLoading(false); }
        return;
      }
      const [{ data: isAdmin }, { data: isOwner }] = await Promise.all([
        (supabase as any).rpc('is_platform_admin', { _user_id: auth.user.id }),
        (supabase as any).rpc('is_platform_owner', { _user_id: auth.user.id }),
      ]);
      if (!active) return;
      setGrade(isOwner ? 'owner' : isAdmin ? 'staff' : null);
      setIsLoading(false);
    })();
    return () => { active = false; };
  }, []);

  return {
    grade,
    isPlatformAdmin: grade !== null,
    isPlatformOwner: grade === 'owner',
    isLoading,
  };
}

