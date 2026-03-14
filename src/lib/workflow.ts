/**
 * Unified Workflow Engine v2
 * Full 25-state item lifecycle with role-based transitions, hard gates, and field locking.
 */

// ────────────────────────────────────────────────
// Types (mirroring DB enums + extensions)
// ────────────────────────────────────────────────

export type ItemLifecycleStatus =
  | 'concept'
  | 'in_design'
  | 'design_ready'
  | 'finishes_proposed'
  | 'finishes_approved_designer'
  | 'finishes_approved_hod'
  | 'client_board_ready'
  | 'client_board_waiting_signature'
  | 'client_board_signed'
  | 'quotation_preparation'
  | 'quotation_inserted'
  | 'quotation_approved_ops'
  | 'quotation_approved_high'
  | 'po_issued'
  | 'proforma_received'
  | 'payment_approval'
  | 'payment_executed'
  | 'in_production'
  | 'ready_to_ship'
  | 'in_delivery'
  | 'delivered_to_site'
  | 'installation_planned'
  | 'installed'
  | 'snagging'
  | 'closed'
  // special
  | 'on_hold'
  | 'cancelled'
  // legacy (kept for backward compat during migration)
  | 'draft'
  | 'estimated'
  | 'approved'
  | 'ordered'
  | 'delivered';

export type AppRole =
  | 'admin'
  | 'coo'
  | 'ceo'
  | 'head_of_design'
  | 'designer'
  | 'architectural_dept'
  | 'qs'
  | 'procurement_manager'
  | 'accountant'
  | 'head_of_payments'
  | 'project_manager'
  | 'client'
  | 'site_engineer'
  | 'mep_engineer';

export type TaskMacroArea =
  | 'planning'
  | 'design_validation'
  | 'procurement'
  | 'production'
  | 'delivery'
  | 'installation'
  | 'closing'
  | 'custom';

// ────────────────────────────────────────────────
// Canonical lifecycle order (excludes on_hold, cancelled, and legacy states)
// ────────────────────────────────────────────────

export const LIFECYCLE_ORDER: ItemLifecycleStatus[] = [
  'concept',
  'in_design',
  'design_ready',
  'finishes_proposed',
  'finishes_approved_designer',
  'finishes_approved_hod',
  'client_board_ready',
  'client_board_waiting_signature',
  'client_board_signed',
  'quotation_preparation',
  'quotation_inserted',
  'quotation_approved_ops',
  'quotation_approved_high',
  'po_issued',
  'proforma_received',
  'payment_approval',
  'payment_executed',
  'in_production',
  'ready_to_ship',
  'in_delivery',
  'delivered_to_site',
  'installation_planned',
  'installed',
  'snagging',
  'closed',
];

// ────────────────────────────────────────────────
// Labels & Colors
// ────────────────────────────────────────────────

export const LIFECYCLE_LABELS: Record<string, string> = {
  concept: 'Concept',
  in_design: 'In Design',
  design_ready: 'Design Ready',
  finishes_proposed: 'Finishes Proposed',
  finishes_approved_designer: 'Finishes Approved (Designer)',
  finishes_approved_hod: 'Finishes Approved (HoD)',
  client_board_ready: 'Client Board Ready',
  client_board_waiting_signature: 'Awaiting Signature',
  client_board_signed: 'Client Board Signed',
  quotation_preparation: 'Quotation In Prep',
  quotation_inserted: 'Quotation Inserted',
  quotation_approved_ops: 'Quotation Approved (Ops)',
  quotation_approved_high: 'Quotation Approved (High)',
  po_issued: 'PO Issued',
  proforma_received: 'Proforma Received',
  payment_approval: 'Payment Approval',
  payment_executed: 'Payment Executed',
  in_production: 'In Production',
  ready_to_ship: 'Ready to Ship',
  in_delivery: 'In Delivery',
  delivered_to_site: 'Delivered to Site',
  installation_planned: 'Installation Planned',
  installed: 'Installed',
  snagging: 'Snagging',
  closed: 'Closed',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
  // legacy
  draft: 'Draft',
  estimated: 'Estimated',
  approved: 'Approved',
  ordered: 'Ordered',
  delivered: 'Delivered',
};

type StatusColorSet = { bg: string; text: string; dot: string };

const PHASE_COLORS = {
  neutral:  { bg: 'bg-muted',             text: 'text-muted-foreground',  dot: 'hsl(var(--muted-foreground))' },
  design:   { bg: 'bg-blue-500/10',       text: 'text-blue-700',          dot: 'hsl(210 80% 50%)' },
  approval: { bg: 'bg-amber-500/10',      text: 'text-amber-700',         dot: 'hsl(38 92% 50%)' },
  client:   { bg: 'bg-purple-500/10',     text: 'text-purple-700',        dot: 'hsl(270 60% 50%)' },
  quote:    { bg: 'bg-orange-500/10',     text: 'text-orange-700',        dot: 'hsl(25 95% 53%)' },
  purchase: { bg: 'bg-primary/10',        text: 'text-primary',           dot: 'hsl(var(--primary))' },
  payment:  { bg: 'bg-emerald-500/10',    text: 'text-emerald-700',       dot: 'hsl(152 69% 40%)' },
  prod:     { bg: 'bg-cyan-500/10',       text: 'text-cyan-700',          dot: 'hsl(188 78% 41%)' },
  logistics:{ bg: 'bg-indigo-500/10',     text: 'text-indigo-700',        dot: 'hsl(234 89% 60%)' },
  install:  { bg: 'bg-status-safe-bg',    text: 'text-status-safe',       dot: 'hsl(var(--status-safe))' },
  done:     { bg: 'bg-status-safe-bg',    text: 'text-status-safe',       dot: 'hsl(var(--status-safe))' },
  danger:   { bg: 'bg-status-unsafe-bg',  text: 'text-status-unsafe',     dot: 'hsl(var(--status-unsafe))' },
  warning:  { bg: 'bg-status-at-risk-bg', text: 'text-status-at-risk',    dot: 'hsl(var(--status-at-risk))' },
} as const;

export const LIFECYCLE_COLORS: Record<string, StatusColorSet> = {
  concept:                        PHASE_COLORS.neutral,
  in_design:                      PHASE_COLORS.design,
  design_ready:                   PHASE_COLORS.design,
  finishes_proposed:              PHASE_COLORS.approval,
  finishes_approved_designer:     PHASE_COLORS.approval,
  finishes_approved_hod:          PHASE_COLORS.approval,
  client_board_ready:             PHASE_COLORS.client,
  client_board_waiting_signature: PHASE_COLORS.client,
  client_board_signed:            PHASE_COLORS.client,
  quotation_preparation:          PHASE_COLORS.quote,
  quotation_inserted:             PHASE_COLORS.quote,
  quotation_approved_ops:         PHASE_COLORS.quote,
  quotation_approved_high:        PHASE_COLORS.quote,
  po_issued:                      PHASE_COLORS.purchase,
  proforma_received:              PHASE_COLORS.purchase,
  payment_approval:               PHASE_COLORS.payment,
  payment_executed:               PHASE_COLORS.payment,
  in_production:                  PHASE_COLORS.prod,
  ready_to_ship:                  PHASE_COLORS.prod,
  in_delivery:                    PHASE_COLORS.logistics,
  delivered_to_site:              PHASE_COLORS.logistics,
  installation_planned:           PHASE_COLORS.install,
  installed:                      PHASE_COLORS.done,
  snagging:                       PHASE_COLORS.warning,
  closed:                         PHASE_COLORS.done,
  on_hold:                        PHASE_COLORS.danger,
  cancelled:                      PHASE_COLORS.danger,
  // legacy
  draft:     PHASE_COLORS.neutral,
  estimated: PHASE_COLORS.warning,
  approved:  PHASE_COLORS.done,
  ordered:   PHASE_COLORS.purchase,
  delivered: PHASE_COLORS.logistics,
};

// ────────────────────────────────────────────────
// Macro-phase grouping for Gantt & dashboards
// ────────────────────────────────────────────────

export interface MacroPhase {
  key: TaskMacroArea;
  label: string;
  states: ItemLifecycleStatus[];
}

export const MACRO_PHASES: MacroPhase[] = [
  { key: 'planning',           label: 'Planning & Prep',       states: ['concept'] },
  { key: 'design_validation',  label: 'Design Validation',     states: ['in_design', 'design_ready', 'finishes_proposed', 'finishes_approved_designer', 'finishes_approved_hod'] },
  { key: 'procurement',        label: 'Procurement',           states: ['client_board_ready', 'client_board_waiting_signature', 'client_board_signed', 'quotation_preparation', 'quotation_inserted', 'quotation_approved_ops', 'quotation_approved_high', 'po_issued', 'proforma_received', 'payment_approval', 'payment_executed'] },
  { key: 'production',         label: 'Production',            states: ['in_production', 'ready_to_ship'] },
  { key: 'delivery',           label: 'Delivery',              states: ['in_delivery', 'delivered_to_site'] },
  { key: 'installation',       label: 'Installation',          states: ['installation_planned', 'installed', 'snagging'] },
  { key: 'closing',            label: 'Closing',               states: ['closed'] },
];

/** Which macro-phase a lifecycle status belongs to */
export function getMacroPhase(status: ItemLifecycleStatus | null): TaskMacroArea {
  if (!status) return 'planning';
  for (const mp of MACRO_PHASES) {
    if ((mp.states as string[]).includes(status)) return mp.key;
  }
  return 'custom';
}

// ────────────────────────────────────────────────
// State Transitions (valid next states)
// ────────────────────────────────────────────────

interface TransitionDef {
  to: ItemLifecycleStatus;
  roles: AppRole[];       // who can trigger this transition
  label: string;          // button label
}

export const STATE_TRANSITIONS: Record<string, TransitionDef[]> = {
  concept: [
    { to: 'in_design', roles: ['admin', 'coo', 'designer', 'architectural_dept', 'head_of_design', 'project_manager'], label: 'Start Design' },
  ],
  in_design: [
    { to: 'design_ready', roles: ['admin', 'coo', 'designer', 'architectural_dept', 'head_of_design'], label: 'Mark Design Ready' },
  ],
  design_ready: [
    { to: 'finishes_proposed', roles: ['admin', 'coo', 'designer', 'head_of_design'], label: 'Propose Finishes' },
    { to: 'in_design', roles: ['admin', 'coo', 'head_of_design'], label: 'Return to Design' },
  ],
  finishes_proposed: [
    { to: 'finishes_approved_designer', roles: ['admin', 'coo', 'designer', 'head_of_design'], label: 'Approve Finishes (Designer)' },
    { to: 'in_design', roles: ['admin', 'coo', 'head_of_design'], label: 'Reject → Back to Design' },
  ],
  finishes_approved_designer: [
    { to: 'finishes_approved_hod', roles: ['admin', 'coo', 'head_of_design'], label: 'Approve Finishes (HoD/COO)' },
    { to: 'client_board_ready', roles: ['admin', 'coo', 'head_of_design', 'designer', 'project_manager'], label: 'Skip HoD → Client Board Ready' },
    { to: 'finishes_proposed', roles: ['admin', 'coo', 'head_of_design'], label: 'Reject → Re-propose' },
  ],
  finishes_approved_hod: [
    { to: 'client_board_ready', roles: ['admin', 'coo', 'head_of_design', 'designer', 'project_manager'], label: 'Client Board Ready' },
    { to: 'finishes_proposed', roles: ['admin', 'coo', 'head_of_design'], label: 'Reject → Re-propose' },
  ],
  client_board_ready: [
    { to: 'client_board_waiting_signature', roles: ['admin', 'coo', 'project_manager', 'designer', 'head_of_design'], label: 'Send for Signature' },
  ],
  client_board_waiting_signature: [
    { to: 'client_board_signed', roles: ['admin', 'coo', 'project_manager', 'client', 'ceo'], label: 'Mark as Signed' },
    { to: 'client_board_ready', roles: ['admin', 'coo', 'project_manager', 'client', 'ceo'], label: 'Reject Board' },
  ],
  client_board_signed: [
    { to: 'quotation_preparation', roles: ['admin', 'coo', 'qs', 'procurement_manager', 'project_manager'], label: 'Start Quotation' },
  ],
  quotation_preparation: [
    { to: 'quotation_inserted', roles: ['admin', 'coo', 'qs', 'procurement_manager'], label: 'Insert Quotation' },
  ],
  quotation_inserted: [
    { to: 'quotation_approved_ops', roles: ['admin', 'coo', 'project_manager', 'qs'], label: 'Approve Quotation (Ops)' },
    { to: 'quotation_preparation', roles: ['admin', 'coo', 'project_manager', 'qs'], label: 'Reject Quotation' },
  ],
  quotation_approved_ops: [
    { to: 'quotation_approved_high', roles: ['admin', 'coo', 'ceo', 'head_of_design'], label: 'Approve Quotation (High)' },
    { to: 'po_issued', roles: ['admin', 'coo', 'procurement_manager', 'project_manager'], label: 'Skip High → Issue PO' },
    { to: 'quotation_preparation', roles: ['admin', 'coo', 'ceo', 'head_of_design'], label: 'Reject Quotation' },
  ],
  quotation_approved_high: [
    { to: 'po_issued', roles: ['admin', 'coo', 'procurement_manager', 'project_manager'], label: 'Issue PO' },
    { to: 'quotation_preparation', roles: ['admin', 'coo', 'ceo', 'head_of_design'], label: 'Reject → Re-quote' },
  ],
  po_issued: [
    { to: 'proforma_received', roles: ['admin', 'coo', 'procurement_manager', 'accountant'], label: 'Proforma Received' },
  ],
  proforma_received: [
    { to: 'payment_approval', roles: ['admin', 'coo', 'accountant', 'head_of_payments', 'project_manager'], label: 'Submit for Payment' },
  ],
  payment_approval: [
    { to: 'payment_executed', roles: ['admin', 'coo', 'ceo', 'accountant', 'head_of_payments'], label: 'Execute Payment' },
    { to: 'proforma_received', roles: ['admin', 'coo'], label: 'Reject Payment' },
  ],
  payment_executed: [
    { to: 'in_production', roles: ['admin', 'coo', 'procurement_manager', 'project_manager'], label: 'Mark In Production' },
  ],
  in_production: [
    { to: 'ready_to_ship', roles: ['admin', 'coo', 'procurement_manager', 'project_manager'], label: 'Ready to Ship' },
  ],
  ready_to_ship: [
    { to: 'in_delivery', roles: ['admin', 'coo', 'procurement_manager', 'project_manager'], label: 'Ship / In Delivery' },
  ],
  in_delivery: [
    { to: 'delivered_to_site', roles: ['admin', 'coo', 'site_engineer', 'project_manager'], label: 'Delivered to Site' },
  ],
  delivered_to_site: [
    { to: 'installation_planned', roles: ['admin', 'coo', 'site_engineer', 'project_manager'], label: 'Plan Installation' },
  ],
  installation_planned: [
    { to: 'installed', roles: ['admin', 'coo', 'site_engineer', 'project_manager'], label: 'Mark Installed' },
  ],
  installed: [
    { to: 'snagging', roles: ['admin', 'coo', 'site_engineer', 'project_manager'], label: 'Report Snagging' },
    { to: 'closed', roles: ['admin', 'coo', 'project_manager'], label: 'Close (no issues)' },
  ],
  snagging: [
    { to: 'installed', roles: ['admin', 'coo', 'site_engineer', 'project_manager'], label: 'Snagging Resolved' },
    { to: 'closed', roles: ['admin', 'coo', 'project_manager'], label: 'Close Item' },
  ],
  closed: [],
};

// Special transitions (available from most states)
export function getSpecialTransitions(currentStatus: string | null): TransitionDef[] {
  if (!currentStatus || currentStatus === 'cancelled' || currentStatus === 'closed') return [];
  const result: TransitionDef[] = [];
  if (currentStatus !== 'on_hold') {
    result.push({ to: 'on_hold', roles: ['admin', 'coo', 'project_manager'], label: 'Put On Hold' });
  }
  if (currentStatus === 'on_hold') {
    // Can return to previous state - handled specially in UI
    result.push({ to: 'concept', roles: ['admin', 'coo', 'project_manager'], label: 'Resume' });
  }
  result.push({ to: 'cancelled', roles: ['admin', 'coo'], label: 'Cancel Item' });
  return result;
}

/** Get all valid transitions for a status + user roles */
export function getAvailableTransitions(currentStatus: string | null, userRoles: AppRole[]): TransitionDef[] {
  const status = currentStatus || 'concept';
  const normal = STATE_TRANSITIONS[status] || [];
  const special = getSpecialTransitions(status);
  return [...normal, ...special].filter(t =>
    t.roles.some(r => userRoles.includes(r))
  );
}

// ────────────────────────────────────────────────
// Lifecycle index (for ordering)
// ────────────────────────────────────────────────

export function getLifecycleIndex(status: ItemLifecycleStatus | string | null): number {
  if (!status || status === 'on_hold' || status === 'cancelled') return -1;
  // Map legacy states
  const mapped = mapLegacyStatus(status);
  const idx = LIFECYCLE_ORDER.indexOf(mapped as ItemLifecycleStatus);
  return idx >= 0 ? idx : -1;
}

/** Map legacy 7-state statuses to new workflow */
export function mapLegacyStatus(status: string): ItemLifecycleStatus {
  const map: Record<string, ItemLifecycleStatus> = {
    draft: 'concept',
    estimated: 'quotation_inserted',
    approved: 'quotation_approved_ops',
    ordered: 'po_issued',
    delivered: 'delivered_to_site',
    installed: 'installed',
    on_hold: 'on_hold',
  };
  return map[status] || (status as ItemLifecycleStatus);
}

// ────────────────────────────────────────────────
// Hard Gates
// ────────────────────────────────────────────────

export interface HardGateCheck {
  blocked: boolean;
  reason?: string;
}

/** Check if an item can move to a target state */
export function checkHardGate(targetStatus: ItemLifecycleStatus, item: {
  lifecycle_status: string | null;
  approval_status?: string;
}): HardGateCheck {
  const idx = getLifecycleIndex(targetStatus);

  // Gate: Cannot go to PO without design approved + finishes approved + client board signed
  if (idx >= LIFECYCLE_ORDER.indexOf('po_issued')) {
    const currentIdx = getLifecycleIndex(item.lifecycle_status);
    if (currentIdx < LIFECYCLE_ORDER.indexOf('client_board_signed')) {
      return { blocked: true, reason: 'Client board must be signed before PO' };
    }
  }

  // Gate: Cannot go to production without PO + payment
  if (idx >= LIFECYCLE_ORDER.indexOf('in_production')) {
    const currentIdx = getLifecycleIndex(item.lifecycle_status);
    if (currentIdx < LIFECYCLE_ORDER.indexOf('payment_executed')) {
      return { blocked: true, reason: 'Payment must be executed before production' };
    }
  }

  return { blocked: false };
}

/** Check if a macro-phase is complete/blocked based on all items */
export function checkMacroPhaseGate(
  macroArea: TaskMacroArea,
  items: Array<{ lifecycle_status: string | null }>
): { blocked: boolean; reason?: string; progress: number } {
  if (items.length === 0) return { blocked: false, progress: 100 };

  const requirements: Record<string, { requiredStatus: ItemLifecycleStatus; label: string }> = {
    design_validation: { requiredStatus: 'finishes_approved_hod', label: 'All items must have approved finishes' },
    procurement:       { requiredStatus: 'po_issued', label: 'All items must have PO issued' },
    production:        { requiredStatus: 'payment_executed', label: 'All items must have payment executed' },
    delivery:          { requiredStatus: 'delivered_to_site', label: 'All items must be delivered to site' },
    installation:      { requiredStatus: 'installed', label: 'All items must be installed' },
    closing:           { requiredStatus: 'closed', label: 'All items must be closed' },
  };

  const req = requirements[macroArea];
  if (!req) return { blocked: false, progress: 100 };

  const requiredIdx = LIFECYCLE_ORDER.indexOf(req.requiredStatus);
  const passedCount = items.filter(i => {
    const idx = getLifecycleIndex(i.lifecycle_status);
    return idx >= requiredIdx;
  }).length;

  const progress = Math.round((passedCount / items.length) * 100);

  if (passedCount === 0) return { blocked: true, reason: req.label, progress: 0 };
  if (passedCount < items.length) return { blocked: false, reason: `${passedCount}/${items.length} items ready`, progress };
  return { blocked: false, progress: 100 };
}

// ────────────────────────────────────────────────
// Field Locking
// ────────────────────────────────────────────────

/** Fields that get locked at certain lifecycle stages */
export function getLockedFields(status: string | null): string[] {
  const idx = getLifecycleIndex(status);
  const locked: string[] = [];

  // After client board signed → lock design fields
  if (idx >= LIFECYCLE_ORDER.indexOf('client_board_signed')) {
    locked.push('dimensions', 'finish_material', 'finish_color', 'finish_notes', 'description');
  }

  // After payment executed → lock everything except logistics/installation dates
  if (idx >= LIFECYCLE_ORDER.indexOf('payment_executed')) {
    locked.push('unit_cost', 'quantity', 'selling_price', 'supplier', 'category', 'area');
  }

  return locked;
}

/** Check if a field is locked for a given item status (override = COO/Admin bypass) */
export function isFieldLocked(fieldName: string, status: string | null, userRoles: AppRole[]): boolean {
  // Admin and COO can override any lock
  if (userRoles.includes('admin') || userRoles.includes('coo')) return false;
  return getLockedFields(status).includes(fieldName);
}

// ────────────────────────────────────────────────
// Role-based field visibility
// ────────────────────────────────────────────────

export type FieldGroup = 'design' | 'finishes' | 'dimensions' | 'costs' | 'procurement' | 'payment' | 'logistics' | 'installation' | 'internal_notes' | 'client_notes';

const ROLE_VISIBLE_FIELDS: Record<AppRole, FieldGroup[]> = {
  admin:              ['design', 'finishes', 'dimensions', 'costs', 'procurement', 'payment', 'logistics', 'installation', 'internal_notes', 'client_notes'],
  coo:                ['design', 'finishes', 'dimensions', 'costs', 'procurement', 'payment', 'logistics', 'installation', 'internal_notes', 'client_notes'],
  ceo:                ['design', 'finishes', 'dimensions', 'client_notes'], // CEO as client: no internal costs
  head_of_design:     ['design', 'finishes', 'dimensions', 'costs', 'procurement', 'internal_notes', 'client_notes'],
  designer:           ['design', 'finishes', 'dimensions', 'client_notes'],
  architectural_dept: ['design', 'finishes', 'dimensions', 'internal_notes'],
  qs:                 ['design', 'finishes', 'dimensions', 'costs', 'procurement', 'internal_notes', 'client_notes'],
  procurement_manager:['design', 'dimensions', 'costs', 'procurement', 'payment', 'logistics', 'internal_notes'],
  accountant:         ['costs', 'payment', 'procurement', 'internal_notes'],
  head_of_payments:   ['costs', 'payment', 'procurement', 'internal_notes'],
  project_manager:    ['design', 'finishes', 'dimensions', 'costs', 'procurement', 'payment', 'logistics', 'installation', 'internal_notes', 'client_notes'],
  client:             ['design', 'finishes', 'dimensions', 'client_notes'],
  site_engineer:      ['design', 'dimensions', 'logistics', 'installation', 'internal_notes'],
  mep_engineer:       ['design', 'dimensions', 'logistics', 'installation', 'internal_notes'],
};

/** Check if a user with given roles can see a field group */
export function canSeeFieldGroup(fieldGroup: FieldGroup, userRoles: AppRole[]): boolean {
  return userRoles.some(role => ROLE_VISIBLE_FIELDS[role]?.includes(fieldGroup));
}

/** Roles that can see cost/pricing data */
export function canSeeCosts(userRoles: AppRole[]): boolean {
  return canSeeFieldGroup('costs', userRoles);
}

// ────────────────────────────────────────────────
// Revision Logic
// ────────────────────────────────────────────────

export interface RevisionTrigger {
  shouldCreateRevision: boolean;
  revertToStatus: ItemLifecycleStatus;
  reason: string;
}

/** Check if changing a field on an item should trigger a new revision */
export function checkRevisionTrigger(
  fieldName: string,
  currentStatus: string | null
): RevisionTrigger | null {
  const idx = getLifecycleIndex(currentStatus);

  // Changing finishes after client board signed → new revision, revert to finishes_proposed
  if (['finish_material', 'finish_color', 'finish_notes'].includes(fieldName)) {
    if (idx >= LIFECYCLE_ORDER.indexOf('client_board_signed')) {
      return {
        shouldCreateRevision: true,
        revertToStatus: 'finishes_proposed',
        reason: `Finish changed after client board signed`,
      };
    }
  }

  // Changing dimensions after client board signed → new revision, revert to design_ready
  if (fieldName === 'dimensions') {
    if (idx >= LIFECYCLE_ORDER.indexOf('client_board_signed')) {
      return {
        shouldCreateRevision: true,
        revertToStatus: 'design_ready',
        reason: `Dimensions changed after client board signed`,
      };
    }
  }

  // Changing design after payment executed → blocked (no trigger, just blocked)
  if (['description', 'dimensions', 'finish_material', 'finish_color'].includes(fieldName)) {
    if (idx >= LIFECYCLE_ORDER.indexOf('payment_executed')) {
      return null; // blocked by field locking, not revision trigger
    }
  }

  return null;
}

// ────────────────────────────────────────────────
// Gantt Auto-Generation: Task chain template per item
// ────────────────────────────────────────────────

export interface AutoTaskTemplate {
  key: string;
  label: string;
  macroArea: TaskMacroArea;
  fromStatus: ItemLifecycleStatus;
  toStatus: ItemLifecycleStatus;
  defaultDurationDays: number; // working days
}

export const ITEM_TASK_CHAIN: AutoTaskTemplate[] = [
  { key: 'design',        label: 'Design',                    macroArea: 'design_validation', fromStatus: 'in_design',                toStatus: 'design_ready',                 defaultDurationDays: 10 },
  { key: 'finishes',      label: 'Finishes Approval',         macroArea: 'design_validation', fromStatus: 'finishes_proposed',         toStatus: 'finishes_approved_hod',        defaultDurationDays: 5 },
  { key: 'client_board',  label: 'Client Board & Signature',  macroArea: 'procurement',       fromStatus: 'client_board_ready',        toStatus: 'client_board_signed',          defaultDurationDays: 7 },
  { key: 'quotation',     label: 'Quotation',                 macroArea: 'procurement',       fromStatus: 'quotation_preparation',     toStatus: 'quotation_approved_ops',       defaultDurationDays: 12 }, // 12 working days
  { key: 'po_payment',    label: 'PO & Payment',              macroArea: 'procurement',       fromStatus: 'po_issued',                 toStatus: 'payment_executed',             defaultDurationDays: 10 },
  { key: 'production',    label: 'Production',                macroArea: 'production',        fromStatus: 'in_production',             toStatus: 'ready_to_ship',                defaultDurationDays: 30 },
  { key: 'delivery',      label: 'Delivery',                  macroArea: 'delivery',          fromStatus: 'in_delivery',               toStatus: 'delivered_to_site',            defaultDurationDays: 14 },
  { key: 'installation',  label: 'Installation',              macroArea: 'installation',      fromStatus: 'installation_planned',      toStatus: 'installed',                    defaultDurationDays: 5 },
  { key: 'closing',       label: 'Snagging & Close',          macroArea: 'closing',           fromStatus: 'snagging',                  toStatus: 'closed',                       defaultDurationDays: 3 },
];

/** Calculate working days (excluding weekends) from a start date */
export function addWorkingDays(startDate: Date, workingDays: number): Date {
  const result = new Date(startDate);
  let added = 0;
  while (added < workingDays) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++; // skip Sat/Sun
  }
  return result;
}

// ────────────────────────────────────────────────
// Critical Path (kept from v1, enhanced)
// ────────────────────────────────────────────────

export interface CriticalPathNode {
  id: string;
  startDate: string | null;
  endDate: string | null;
  dependsOn?: string;
}

export function computeCriticalPath(nodes: CriticalPathNode[]): Set<string> {
  if (nodes.length === 0) return new Set();

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const longestPath = new Map<string, number>();
  const pathParent = new Map<string, string | null>();

  function getLength(id: string): number {
    if (longestPath.has(id)) return longestPath.get(id)!;
    const node = nodeMap.get(id);
    if (!node) { longestPath.set(id, 0); return 0; }

    let duration = 0;
    if (node.startDate && node.endDate) {
      const start = new Date(node.startDate).getTime();
      const end = new Date(node.endDate).getTime();
      duration = Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
    }

    if (!node.dependsOn || !nodeMap.has(node.dependsOn)) {
      longestPath.set(id, duration);
      pathParent.set(id, null);
      return duration;
    }

    const parentLength = getLength(node.dependsOn);
    const total = parentLength + duration;
    longestPath.set(id, total);
    pathParent.set(id, node.dependsOn);
    return total;
  }

  nodes.forEach(n => getLength(n.id));

  let maxId = '';
  let maxLen = -1;
  longestPath.forEach((len, id) => {
    if (len > maxLen) { maxLen = len; maxId = id; }
  });

  const criticalSet = new Set<string>();
  let cur: string | null = maxId;
  while (cur) {
    criticalSet.add(cur);
    cur = pathParent.get(cur) || null;
  }

  return criticalSet;
}

// ────────────────────────────────────────────────
// KPI Calculation helpers
// ────────────────────────────────────────────────

export interface ProjectKPIs {
  designApproved: number;        // % items with design_ready+
  finishesApproved: number;      // % items with finishes_approved+
  clientBoardSigned: number;     // % items with client_board_signed+
  poIssued: number;              // % items with po_issued+
  paymentExecuted: number;       // % items with payment_executed+
  inProduction: number;          // % items in_production+
  delivered: number;             // % items delivered_to_site+
  installed: number;             // % items installed+
  closed: number;                // % items closed
  totalItems: number;
}

// ────────────────────────────────────────────────
// Backward compatibility aliases
// ────────────────────────────────────────────────

/** @deprecated Use checkMacroPhaseGate instead */
export const isGateBlocked = (macroArea: TaskMacroArea, items: Array<{ lifecycle_status: string | null }>) =>
  checkMacroPhaseGate(macroArea, items);

/** @deprecated Use MACRO_PHASES for gate logic */
export const GATE_REQUIREMENTS: Partial<Record<TaskMacroArea, { requiredLifecycle: string; label: string }>> = {
  procurement:  { requiredLifecycle: 'po_issued',        label: 'All items must have PO issued' },
  production:   { requiredLifecycle: 'payment_executed',  label: 'All items must have payment executed' },
  delivery:     { requiredLifecycle: 'delivered_to_site', label: 'All items must be delivered to site' },
  installation: { requiredLifecycle: 'installed',         label: 'All items must be installed' },
  closing:      { requiredLifecycle: 'closed',            label: 'All items must be closed' },
};

/** @deprecated Use canAdvanceTo logic via getAvailableTransitions */
export function canAdvanceTo(current: ItemLifecycleStatus | null, target: ItemLifecycleStatus): boolean {
  const currentIdx = getLifecycleIndex(current);
  const targetIdx = getLifecycleIndex(target);
  if (target === 'on_hold' || target === 'cancelled') return true;
  if (currentIdx < 0) return targetIdx === 0;
  return targetIdx === currentIdx + 1;
}

export function computeProjectKPIs(items: Array<{ lifecycle_status: string | null; is_active?: boolean }>): ProjectKPIs {
  const active = items.filter(i => i.is_active !== false);
  const total = active.length;
  if (total === 0) return { designApproved: 0, finishesApproved: 0, clientBoardSigned: 0, poIssued: 0, paymentExecuted: 0, inProduction: 0, delivered: 0, installed: 0, closed: 0, totalItems: 0 };

  const pct = (minStatus: ItemLifecycleStatus) => {
    const minIdx = LIFECYCLE_ORDER.indexOf(minStatus);
    const count = active.filter(i => getLifecycleIndex(i.lifecycle_status) >= minIdx).length;
    return Math.round((count / total) * 100);
  };

  return {
    designApproved: pct('design_ready'),
    finishesApproved: pct('finishes_approved_hod'),
    clientBoardSigned: pct('client_board_signed'),
    poIssued: pct('po_issued'),
    paymentExecuted: pct('payment_executed'),
    inProduction: pct('in_production'),
    delivered: pct('delivered_to_site'),
    installed: pct('installed'),
    closed: pct('closed'),
    totalItems: total,
  };
}
