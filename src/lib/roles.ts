/**
 * Two-level role model.
 * Level 1 — organization roles (permissions), stored in public.user_roles
 *           scoped by organization_id. A user may hold many roles = 1 seat.
 * Level 2 — project assignments (operational function on a single project),
 *           stored in public.project_assignments.
 */
import type { AppRole } from '@/lib/workflow';

export const ORG_ROLES: AppRole[] = [
  'admin',
  'ceo',
  'coo',
  'project_manager',
  'head_of_design',
  'designer',
  'architectural_dept',
  'mep_engineer',
  'site_engineer',
  'qs',
  'procurement_manager',
  'accountant',
  'head_of_payments',
  'client',
];

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  ceo: 'CEO',
  coo: 'COO',
  project_manager: 'Project Manager',
  head_of_design: 'Head of Design',
  designer: 'Designer',
  architectural_dept: 'Architectural Dept',
  mep_engineer: 'MEP Engineer',
  site_engineer: 'Site Engineer',
  qs: 'QS',
  procurement_manager: 'Purchasing / Procurement',
  accountant: 'Accountant',
  head_of_payments: 'Head of Payments',
  client: 'Client',
};

export const roleLabel = (r: string) => ROLE_LABELS[r] ?? r;
