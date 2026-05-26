/**
 * ImpersonateBanner — shows a fixed top banner when a super-admin is
 * viewing the app as another organization (impersonation mode).
 *
 * Impersonation is stored in localStorage as `studioscope.impersonateOrgId`.
 * Clearing it returns to the admin's own org context.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';

export const IMPERSONATE_KEY = 'studioscope.impersonateOrgId';

export function setImpersonatedOrg(id: string | null) {
  if (id) localStorage.setItem(IMPERSONATE_KEY, id);
  else localStorage.removeItem(IMPERSONATE_KEY);
  window.dispatchEvent(new Event('studioscope.impersonate-change'));
}

export function useImpersonatedOrgId() {
  const [id, setId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : localStorage.getItem(IMPERSONATE_KEY),
  );
  useEffect(() => {
    const sync = () => setId(localStorage.getItem(IMPERSONATE_KEY));
    window.addEventListener('storage', sync);
    window.addEventListener('studioscope.impersonate-change', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('studioscope.impersonate-change', sync);
    };
  }, []);
  return id;
}

export function ImpersonateBanner() {
  const { roles } = useUserRole();
  const impersonateId = useImpersonatedOrgId();
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    if (!impersonateId) { setOrgName(null); return; }
    (async () => {
      const { data } = await (supabase as any).rpc('admin_get_org', { p_org: impersonateId });
      setOrgName(data?.[0]?.name ?? 'Unknown org');
    })();
  }, [impersonateId]);

  if (!impersonateId || !roles.includes('admin' as any)) return null;

  return (
    <div className="sticky top-0 z-[80] bg-yellow-500 text-yellow-950 px-4 py-1.5 flex items-center justify-between gap-3 text-xs font-medium shadow">
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">
          VIEW-AS mode — you are inspecting <strong>{orgName ?? '…'}</strong> as a super-admin.
        </span>
      </div>
      <Button
        size="sm" variant="ghost"
        className="h-6 px-2 text-yellow-950 hover:bg-yellow-600/30"
        onClick={() => setImpersonatedOrg(null)}
      >
        <X className="w-3.5 h-3.5 mr-1" /> Exit
      </Button>
    </div>
  );
}
