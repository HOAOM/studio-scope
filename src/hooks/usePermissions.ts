/**
 * usePermissions — single source of truth for UI-level RBAC.
 *
 * Combines:
 *  - organization roles (public.user_roles, scoped to the ACTIVE organization)
 *  - platform staff layer (public.platform_admins)
 *  - org admin flag (RPC is_org_admin on the active org)
 *
 * The backend stays authoritative (RLS + triggers): this hook only decides what
 * is *shown* so users never click into an "Access denied" wall.
 */
import { useMemo } from 'react';
import { useUserRole } from '@/hooks/useUserRole';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { useIsAdmin } from '@/hooks/useAdminData';

export type ProjectSectionKey =
  | 'overview'
  | 'boq'
  | 'gantt'
  | 'approval'
  | 'items'
  | 'client-boards'
  | 'supplier-docs'
  | 'presentation'
  | 'chat'
  | 'marble-slab'
  | 'door'
  | 'windows'
  | 'panels'
  | 'loading';

/** Roles allowed per project section. `null` = everyone with project access. */
const SECTION_ROLES: Record<ProjectSectionKey, string[] | null> = {
  overview: null,
  boq: null,
  gantt: null,
  items: null,
  chat: null,
  approval: [
    'admin', 'ceo', 'coo', 'project_manager', 'head_of_design', 'designer',
    'architectural_dept', 'mep_engineer', 'site_engineer', 'qs',
    'procurement_manager', 'accountant', 'head_of_payments',
  ],
  'supplier-docs': [
    'admin', 'ceo', 'coo', 'project_manager', 'procurement_manager',
    'qs', 'accountant', 'head_of_payments',
  ],
  'client-boards': null,
  presentation: null,
  'marble-slab': [
    'admin', 'ceo', 'coo', 'project_manager', 'head_of_design', 'designer',
    'architectural_dept', 'site_engineer', 'procurement_manager', 'qs',
  ],
  door: [
    'admin', 'ceo', 'coo', 'project_manager', 'head_of_design', 'designer',
    'architectural_dept', 'site_engineer', 'procurement_manager', 'qs',
  ],
  windows: [
    'admin', 'ceo', 'coo', 'project_manager', 'head_of_design', 'designer',
    'architectural_dept', 'site_engineer', 'procurement_manager', 'qs',
  ],
  panels: [
    'admin', 'ceo', 'coo', 'project_manager', 'head_of_design', 'designer',
    'architectural_dept', 'site_engineer', 'procurement_manager', 'qs',
  ],
  loading: [
    'admin', 'ceo', 'coo', 'project_manager', 'site_engineer',
    'procurement_manager', 'qs',
  ],
};

export function usePermissions() {
  const { roles, canSeeCosts, isLoading: rolesLoading } = useUserRole();
  const { isPlatformAdmin, isPlatformOwner, isLoading: platformLoading } = usePlatformAdmin();
  const { data: isOrgAdmin = false, isLoading: adminLoading } = useIsAdmin();

  const isLoading = rolesLoading || platformLoading || adminLoading;

  const canSeeSection = useMemo(() => {
    return (section: ProjectSectionKey) => {
      if (isOrgAdmin || isPlatformAdmin) return true;
      const allowed = SECTION_ROLES[section];
      if (allowed === null || allowed === undefined) return true;
      return roles.some((r) => allowed.includes(r as string));
    };
  }, [roles, isOrgAdmin, isPlatformAdmin]);

  return {
    roles,
    canSeeCosts,
    isOrgAdmin: isOrgAdmin || isPlatformAdmin,
    isPlatformAdmin,
    isPlatformOwner,
    canSeeSection,
    isLoading,
  };
}
