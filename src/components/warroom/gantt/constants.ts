import { TaskMacroArea } from '@/lib/workflow';

export const ROW_HEIGHT = 42;
export const GROUP_HEADER_HEIGHT = 38;
export const LEFT_PANEL_WIDTH = 380;
export const MIN_CHART_WIDTH = 700;

/** Default working-day durations per macro-phase */
export const PHASE_DURATIONS: Record<TaskMacroArea, number> = {
  planning: 10,
  design_validation: 7,
  procurement: 13,
  production: 60,
  delivery: 35,
  installation: 7,
  closing: 5,
  custom: 5,
};

export const GROUP_ORDER = [
  'planning', 'design_validation', 'procurement', 'production',
  'delivery', 'installation', 'closing',
];

export const GROUP_LABELS: Record<string, string> = {
  planning: 'Planning & Prep',
  design_validation: 'Design & Validation',
  procurement: 'Procurement',
  production: 'Production',
  delivery: 'Delivery',
  installation: 'Installation',
  closing: 'Closing',
};

export const GROUP_COLORS: Record<string, { hue: string; bar: string; barGradient: string }> = {
  planning:          { hue: '210', bar: 'hsl(210, 70%, 52%)', barGradient: 'linear-gradient(135deg, hsl(210,70%,48%), hsl(210,70%,58%))' },
  design_validation: { hue: '190', bar: 'hsl(190, 70%, 48%)', barGradient: 'linear-gradient(135deg, hsl(190,70%,44%), hsl(190,70%,54%))' },
  procurement:       { hue: '38',  bar: 'hsl(38, 85%, 50%)',  barGradient: 'linear-gradient(135deg, hsl(38,85%,46%), hsl(38,85%,56%))' },
  production:        { hue: '245', bar: 'hsl(245, 55%, 55%)', barGradient: 'linear-gradient(135deg, hsl(245,55%,50%), hsl(245,55%,62%))' },
  delivery:          { hue: '270', bar: 'hsl(270, 50%, 52%)', barGradient: 'linear-gradient(135deg, hsl(270,50%,48%), hsl(270,50%,58%))' },
  installation:      { hue: '155', bar: 'hsl(155, 60%, 42%)', barGradient: 'linear-gradient(135deg, hsl(155,60%,38%), hsl(155,60%,48%))' },
  closing:           { hue: '350', bar: 'hsl(350, 60%, 52%)', barGradient: 'linear-gradient(135deg, hsl(350,60%,48%), hsl(350,60%,58%))' },
  custom:            { hue: '215', bar: 'hsl(215, 20%, 50%)', barGradient: 'linear-gradient(135deg, hsl(215,20%,45%), hsl(215,20%,55%))' },
};

/** Phase styles for item bars */
export const ITEM_PHASE_STYLES: Record<string, { gradient: string; label: string; color: string }> = {
  planning:          { gradient: 'linear-gradient(135deg, hsl(210,70%,48%), hsl(210,70%,58%))',  label: 'Planning',     color: 'hsl(210,70%,52%)' },
  design_validation: { gradient: 'linear-gradient(135deg, hsl(190,70%,44%), hsl(190,70%,54%))',  label: 'Design',       color: 'hsl(190,70%,48%)' },
  procurement:       { gradient: 'linear-gradient(135deg, hsl(38,85%,46%), hsl(38,85%,56%))',    label: 'Procurement',  color: 'hsl(38,85%,50%)' },
  production:        { gradient: 'linear-gradient(135deg, hsl(245,55%,50%), hsl(245,55%,62%))',  label: 'Production',   color: 'hsl(245,55%,55%)' },
  delivery:          { gradient: 'linear-gradient(135deg, hsl(270,50%,48%), hsl(270,50%,58%))',  label: 'Delivery',     color: 'hsl(270,50%,52%)' },
  installation:      { gradient: 'linear-gradient(135deg, hsl(155,60%,38%), hsl(155,60%,48%))',  label: 'Installation', color: 'hsl(155,60%,42%)' },
  closing:           { gradient: 'linear-gradient(135deg, hsl(350,60%,48%), hsl(350,60%,58%))',  label: 'Closing',      color: 'hsl(350,60%,52%)' },
};

/** Fixed gates per macro-area */
export const PHASE_GATES: Record<string, { key: string; label: string; requiredStatuses: string[] }[]> = {
  design_validation: [
    { key: 'designer_approved', label: 'Designer ✓', requiredStatuses: ['finishes_approved_designer', 'finishes_approved_hod', 'client_board_ready', 'client_board_waiting_signature', 'client_board_signed'] },
    { key: 'hod_approved', label: 'HoD ✓', requiredStatuses: ['finishes_approved_hod', 'client_board_ready', 'client_board_waiting_signature', 'client_board_signed'] },
    { key: 'client_board_signed', label: 'Board Signed', requiredStatuses: ['client_board_signed'] },
  ],
  procurement: [
    { key: 'quote_approved', label: 'Quote ✓', requiredStatuses: ['quotation_approved_ops', 'quotation_approved_high', 'po_issued', 'proforma_received', 'payment_approval', 'payment_executed'] },
    { key: 'po_issued', label: 'PO', requiredStatuses: ['po_issued', 'proforma_received', 'payment_approval', 'payment_executed'] },
    { key: 'payment_done', label: 'Paid', requiredStatuses: ['payment_executed'] },
  ],
  delivery: [
    { key: 'delivered', label: 'Delivered', requiredStatuses: ['delivered_to_site'] },
  ],
  installation: [
    { key: 'installed', label: 'Installed', requiredStatuses: ['installed', 'snagging', 'closed'] },
  ],
};

/** Status configs for display */
export const STATUS_CONFIG: Record<string, { label: string; dotColor: string; textClass: string }> = {
  todo:        { label: 'To Do',       dotColor: 'hsl(var(--muted-foreground))', textClass: 'text-muted-foreground' },
  in_progress: { label: 'In Progress', dotColor: 'hsl(var(--primary))',          textClass: 'text-primary' },
  done:        { label: 'Done',        dotColor: 'hsl(var(--status-safe))',       textClass: 'text-[hsl(var(--status-safe))]' },
  blocked:     { label: 'Blocked',     dotColor: 'hsl(var(--status-unsafe))',     textClass: 'text-[hsl(var(--status-unsafe))]' },
  concept:                        { label: 'Concept',              dotColor: 'hsl(var(--muted-foreground))', textClass: 'text-muted-foreground' },
  in_design:                      { label: 'In Design',            dotColor: 'hsl(210, 70%, 48%)',           textClass: 'text-blue-600' },
  design_ready:                   { label: 'Design Ready',         dotColor: 'hsl(210, 70%, 48%)',           textClass: 'text-blue-600' },
  finishes_proposed:              { label: 'Finishes Proposed',    dotColor: 'hsl(38, 85%, 50%)',            textClass: 'text-amber-600' },
  finishes_approved_designer:     { label: 'Finishes ✓ (Designer)',dotColor: 'hsl(38, 85%, 50%)',            textClass: 'text-amber-600' },
  finishes_approved_hod:          { label: 'Finishes ✓ (HoD)',     dotColor: 'hsl(38, 85%, 50%)',            textClass: 'text-amber-600' },
  client_board_ready:             { label: 'Board Ready',          dotColor: 'hsl(270, 50%, 50%)',           textClass: 'text-purple-600' },
  client_board_waiting_signature: { label: 'Awaiting Signature',   dotColor: 'hsl(270, 50%, 50%)',           textClass: 'text-purple-600' },
  client_board_signed:            { label: 'Board Signed',         dotColor: 'hsl(270, 50%, 50%)',           textClass: 'text-purple-600' },
  quotation_preparation:          { label: 'Quote In Prep',        dotColor: 'hsl(25, 90%, 52%)',            textClass: 'text-orange-600' },
  quotation_inserted:             { label: 'Quote Inserted',       dotColor: 'hsl(25, 90%, 52%)',            textClass: 'text-orange-600' },
  quotation_approved_ops:         { label: 'Quote ✓ (Ops)',        dotColor: 'hsl(25, 90%, 52%)',            textClass: 'text-orange-600' },
  quotation_approved_high:        { label: 'Quote ✓ (High)',       dotColor: 'hsl(25, 90%, 52%)',            textClass: 'text-orange-600' },
  po_issued:                      { label: 'PO Issued',            dotColor: 'hsl(var(--primary))',          textClass: 'text-primary' },
  proforma_received:              { label: 'Proforma Received',    dotColor: 'hsl(var(--primary))',          textClass: 'text-primary' },
  payment_approval:               { label: 'Payment Approval',     dotColor: 'hsl(152, 60%, 40%)',           textClass: 'text-emerald-600' },
  payment_executed:               { label: 'Payment Executed',     dotColor: 'hsl(152, 60%, 40%)',           textClass: 'text-emerald-600' },
  in_production:                  { label: 'In Production',        dotColor: 'hsl(188, 70%, 42%)',           textClass: 'text-cyan-600' },
  ready_to_ship:                  { label: 'Ready to Ship',        dotColor: 'hsl(188, 70%, 42%)',           textClass: 'text-cyan-600' },
  in_delivery:                    { label: 'In Delivery',          dotColor: 'hsl(234, 80%, 58%)',           textClass: 'text-indigo-600' },
  delivered_to_site:              { label: 'Delivered to Site',     dotColor: 'hsl(234, 80%, 58%)',           textClass: 'text-indigo-600' },
  installation_planned:           { label: 'Install Planned',      dotColor: 'hsl(var(--status-safe))',      textClass: 'text-[hsl(var(--status-safe))]' },
  installed:                      { label: 'Installed',            dotColor: 'hsl(var(--status-safe))',      textClass: 'text-[hsl(var(--status-safe))]' },
  snagging:                       { label: 'Snagging',             dotColor: 'hsl(var(--status-at-risk))',   textClass: 'text-[hsl(var(--status-at-risk))]' },
  closed:                         { label: 'Closed',               dotColor: 'hsl(var(--status-safe))',      textClass: 'text-[hsl(var(--status-safe))]' },
  on_hold:                        { label: 'On Hold',              dotColor: 'hsl(var(--status-unsafe))',    textClass: 'text-[hsl(var(--status-unsafe))]' },
  cancelled:                      { label: 'Cancelled',            dotColor: 'hsl(var(--status-unsafe))',    textClass: 'text-[hsl(var(--status-unsafe))]' },
  draft:       { label: 'Draft',       dotColor: 'hsl(var(--muted-foreground))', textClass: 'text-muted-foreground' },
  approved:    { label: 'Approved',    dotColor: 'hsl(var(--status-safe))',       textClass: 'text-[hsl(var(--status-safe))]' },
  estimated:   { label: 'Estimated',   dotColor: 'hsl(var(--status-at-risk))',    textClass: 'text-[hsl(var(--status-at-risk))]' },
  ordered:     { label: 'Ordered',     dotColor: 'hsl(var(--primary))',          textClass: 'text-primary' },
  delivered:   { label: 'Delivered',   dotColor: 'hsl(var(--status-safe))',       textClass: 'text-[hsl(var(--status-safe))]' },
};

/** Lifecycle statuses that imply waiting from client */
export const WAITING_CLIENT_STATUSES = new Set([
  'client_board_waiting_signature',
  'finishes_proposed',
]);

/** Lifecycle statuses that imply waiting from supplier */
export const WAITING_SUPPLIER_STATUSES = new Set([
  'in_production',
  'ready_to_ship',
  'in_delivery',
  'proforma_received',
]);

/** Map each role to the lifecycle statuses that are "their responsibility" */
export const ROLE_RESPONSIBILITY_STATUSES: Record<string, Set<string>> = {
  designer: new Set(['concept', 'in_design', 'design_ready', 'finishes_proposed', 'finishes_approved_designer']),
  head_of_design: new Set(['concept', 'in_design', 'design_ready', 'finishes_proposed', 'finishes_approved_designer', 'finishes_approved_hod']),
  architectural_dept: new Set(['concept', 'in_design', 'design_ready']),
  qs: new Set(['quotation_preparation', 'quotation_inserted', 'quotation_approved_ops', 'quotation_approved_high']),
  procurement_manager: new Set(['quotation_preparation', 'quotation_inserted', 'quotation_approved_ops', 'quotation_approved_high', 'po_issued', 'proforma_received']),
  head_of_payments: new Set(['payment_approval', 'payment_executed', 'proforma_received']),
  accountant: new Set(['payment_approval', 'payment_executed']),
  project_manager: new Set(['concept', 'in_design', 'design_ready', 'finishes_proposed', 'client_board_ready', 'client_board_waiting_signature', 'installation_planned', 'installed', 'snagging', 'closed']),
  site_engineer: new Set(['delivered_to_site', 'installation_planned', 'installed', 'snagging']),
  mep_engineer: new Set(['installation_planned', 'installed', 'snagging']),
  client: new Set(['client_board_waiting_signature', 'finishes_proposed']),
  ceo: new Set(['quotation_approved_high', 'payment_approval']),
  coo: new Set(), // COO sees everything
  admin: new Set(), // Admin sees everything
};
