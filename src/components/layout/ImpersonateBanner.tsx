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
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';

export const IMPERSONATE_KEY = 'studioscope.impersonateOrgId';
const ACTIVE_ORG_KEY = 'studioscope.activeOrgId';

export function setImpersonatedOrg(id: string | null) {
  if (id) localStorage.setItem(IMPERSONATE_KEY, id);
  else localStorage.removeItem(IMPERSONATE_KEY);
  window.dispatchEvent(new Event('studioscope.impersonate-change'));
}

/**
 * Opens a real impersonation session: the DB logs it in
 * platform_impersonation_log and, while it is open, the platform admin gets
 * MEMBER-level visibility on that organization (impersonating_org()).
 */
export async function startImpersonation(orgId: string, reason = 'super-admin view-as') {
  const { error } = await (supabase as any).rpc('platform_impersonation_start', {
    p_organization_id: orgId,
    p_target_user_id: null,
    p_reason: reason,
  });
  if (error) throw error;
  localStorage.setItem(ACTIVE_ORG_KEY, orgId);
  setImpersonatedOrg(orgId);
}

/** Closes every open impersonation session and restores the admin's own org. */
export async function stopImpersonation() {
  await (supabase as any).rpc('platform_impersonation_end_all');
  localStorage.removeItem(ACTIVE_ORG_KEY);
  setImpersonatedOrg(null);
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
  const { isPlatformAdmin } = usePlatformAdmin();
  const impersonateId = useImpersonatedOrgId();
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    if (!impersonateId) { setOrgName(null); return; }
    (async () => {
      const { data } = await (supabase as any).rpc('admin_get_org', { p_org: impersonateId });
      setOrgName(data?.[0]?.name ?? 'Unknown org');
    })();
  }, [impersonateId]);

  if (!impersonateId || !isPlatformAdmin) return null;

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
        onClick={async () => {
          await stopImpersonation();
          window.location.assign('/');
        }}
      >
        <X className="w-3.5 h-3.5 mr-1" /> Exit
      </Button>
    </div>
  );
}
