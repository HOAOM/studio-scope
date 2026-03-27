import { TaskMacroArea } from '@/lib/workflow';

export const ROW_HEIGHT = 40;
export const GROUP_HEADER_HEIGHT = 36;
export const LEFT_PANEL_WIDTH = 420;
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
  design_validation: 'Design Validation',
  procurement: 'Procurement',
  production: 'Production',
  delivery: 'Delivery',
  installation: 'Installation',
  closing: 'Closing',
  custom: 'Custom Tasks',
};

export const GROUP_COLORS: Record<string, { hue: string; bar: string; barGradient: string }> = {
  planning:          { hue: '210', bar: 'hsl(210, 80%, 55%)', barGradient: 'linear-gradient(135deg, hsl(210,80%,50%), hsl(210,80%,62%))' },
  design_validation: { hue: '190', bar: 'hsl(190, 80%, 50%)', barGradient: 'linear-gradient(135deg, hsl(190,80%,45%), hsl(190,80%,58%))' },
  procurement:       { hue: '38',  bar: 'hsl(38, 90%, 52%)',  barGradient: 'linear-gradient(135deg, hsl(38,90%,48%), hsl(38,90%,60%))' },
  production:        { hue: '245', bar: 'hsl(245, 60%, 58%)', barGradient: 'linear-gradient(135deg, hsl(245,60%,53%), hsl(245,60%,65%))' },
  delivery:          { hue: '270', bar: 'hsl(270, 55%, 55%)', barGradient: 'linear-gradient(135deg, hsl(270,55%,50%), hsl(270,55%,62%))' },
  installation:      { hue: '155', bar: 'hsl(155, 65%, 45%)', barGradient: 'linear-gradient(135deg, hsl(155,65%,40%), hsl(155,65%,52%))' },
  closing:           { hue: '350', bar: 'hsl(350, 65%, 55%)', barGradient: 'linear-gradient(135deg, hsl(350,65%,50%), hsl(350,65%,62%))' },
  custom:            { hue: '215', bar: 'hsl(215, 20%, 50%)', barGradient: 'linear-gradient(135deg, hsl(215,20%,45%), hsl(215,20%,55%))' },
};

/** Phase styles for item bars - one per macro-phase, colored to match group */
export const ITEM_PHASE_STYLES: Record<string, { gradient: string; label: string; color: string }> = {
  planning:          { gradient: 'linear-gradient(135deg, hsl(210,80%,50%), hsl(210,80%,62%))',  label: 'Planning & Prep',     color: 'hsl(210,80%,55%)' },
  design_validation: { gradient: 'linear-gradient(135deg, hsl(190,80%,45%), hsl(190,80%,58%))',  label: 'Design Validation',   color: 'hsl(190,80%,50%)' },
  procurement:       { gradient: 'linear-gradient(135deg, hsl(38,90%,48%), hsl(38,90%,60%))',    label: 'Procurement',         color: 'hsl(38,90%,52%)' },
  production:        { gradient: 'linear-gradient(135deg, hsl(245,55%,50%), hsl(245,55%,62%))',  label: 'Production',          color: 'hsl(245,55%,58%)' },
  delivery:          { gradient: 'linear-gradient(135deg, hsl(270,50%,48%), hsl(270,50%,60%))',  label: 'Delivery',            color: 'hsl(270,50%,55%)' },
  installation:      { gradient: 'linear-gradient(135deg, hsl(155,60%,38%), hsl(155,60%,50%))',  label: 'Installation',        color: 'hsl(155,60%,45%)' },
  closing:           { gradient: 'linear-gradient(135deg, hsl(350,65%,50%), hsl(350,65%,62%))',  label: 'Closing',             color: 'hsl(350,65%,55%)' },
  // Legacy keys kept for backward compat
  transit:    { gradient: 'linear-gradient(135deg, hsl(38,85%,48%), hsl(38,85%,60%))',    label: 'Transit',    color: 'hsl(38,85%,52%)' },
  site:       { gradient: 'linear-gradient(135deg, hsl(270,50%,48%), hsl(270,50%,60%))',  label: 'Site Move',  color: 'hsl(270,50%,55%)' },
  install:    { gradient: 'linear-gradient(135deg, hsl(155,60%,38%), hsl(155,60%,50%))',  label: 'Install',    color: 'hsl(155,60%,45%)' },
  estimated:  { gradient: 'linear-gradient(135deg, hsl(0,0%,60%), hsl(0,0%,72%))',        label: 'Estimated',  color: 'hsl(0,0%,65%)' },
};

export const STATUS_CONFIG: Record<string, { label: string; dotColor: string; textClass: string }> = {
  // Task statuses
  todo:        { label: 'To Do',       dotColor: 'hsl(var(--muted-foreground))', textClass: 'text-muted-foreground' },
  in_progress: { label: 'In Progress', dotColor: 'hsl(var(--primary))',          textClass: 'text-primary' },
  done:        { label: 'Done',        dotColor: 'hsl(var(--status-safe))',       textClass: 'text-[hsl(var(--status-safe))]' },
  blocked:     { label: 'Blocked',     dotColor: 'hsl(var(--status-unsafe))',     textClass: 'text-[hsl(var(--status-unsafe))]' },
  // Item lifecycle statuses
  concept:                        { label: 'Concept',              dotColor: 'hsl(var(--muted-foreground))', textClass: 'text-muted-foreground' },
  in_design:                      { label: 'In Design',            dotColor: 'hsl(210, 80%, 50%)',           textClass: 'text-blue-600' },
  design_ready:                   { label: 'Design Ready',         dotColor: 'hsl(210, 80%, 50%)',           textClass: 'text-blue-600' },
  finishes_proposed:              { label: 'Finishes Proposed',    dotColor: 'hsl(38, 92%, 50%)',            textClass: 'text-amber-600' },
  finishes_approved_designer:     { label: 'Finishes ✓ (Designer)',dotColor: 'hsl(38, 92%, 50%)',            textClass: 'text-amber-600' },
  finishes_approved_hod:          { label: 'Finishes ✓ (HoD)',     dotColor: 'hsl(38, 92%, 50%)',            textClass: 'text-amber-600' },
  client_board_ready:             { label: 'Board Ready',          dotColor: 'hsl(270, 60%, 50%)',           textClass: 'text-purple-600' },
  client_board_waiting_signature: { label: 'Awaiting Signature',   dotColor: 'hsl(270, 60%, 50%)',           textClass: 'text-purple-600' },
  client_board_signed:            { label: 'Board Signed',         dotColor: 'hsl(270, 60%, 50%)',           textClass: 'text-purple-600' },
  quotation_preparation:          { label: 'Quote In Prep',        dotColor: 'hsl(25, 95%, 53%)',            textClass: 'text-orange-600' },
  quotation_inserted:             { label: 'Quote Inserted',       dotColor: 'hsl(25, 95%, 53%)',            textClass: 'text-orange-600' },
  quotation_approved_ops:         { label: 'Quote ✓ (Ops)',        dotColor: 'hsl(25, 95%, 53%)',            textClass: 'text-orange-600' },
  quotation_approved_high:        { label: 'Quote ✓ (High)',       dotColor: 'hsl(25, 95%, 53%)',            textClass: 'text-orange-600' },
  po_issued:                      { label: 'PO Issued',            dotColor: 'hsl(var(--primary))',          textClass: 'text-primary' },
  proforma_received:              { label: 'Proforma Received',    dotColor: 'hsl(var(--primary))',          textClass: 'text-primary' },
  payment_approval:               { label: 'Payment Approval',     dotColor: 'hsl(152, 69%, 40%)',           textClass: 'text-emerald-600' },
  payment_executed:               { label: 'Payment Executed',     dotColor: 'hsl(152, 69%, 40%)',           textClass: 'text-emerald-600' },
  in_production:                  { label: 'In Production',        dotColor: 'hsl(188, 78%, 41%)',           textClass: 'text-cyan-600' },
  ready_to_ship:                  { label: 'Ready to Ship',        dotColor: 'hsl(188, 78%, 41%)',           textClass: 'text-cyan-600' },
  in_delivery:                    { label: 'In Delivery',          dotColor: 'hsl(234, 89%, 60%)',           textClass: 'text-indigo-600' },
  delivered_to_site:              { label: 'Delivered to Site',     dotColor: 'hsl(234, 89%, 60%)',           textClass: 'text-indigo-600' },
  installation_planned:           { label: 'Install Planned',      dotColor: 'hsl(var(--status-safe))',      textClass: 'text-[hsl(var(--status-safe))]' },
  installed:                      { label: 'Installed',            dotColor: 'hsl(var(--status-safe))',      textClass: 'text-[hsl(var(--status-safe))]' },
  snagging:                       { label: 'Snagging',             dotColor: 'hsl(var(--status-at-risk))',   textClass: 'text-[hsl(var(--status-at-risk))]' },
  closed:                         { label: 'Closed',               dotColor: 'hsl(var(--status-safe))',      textClass: 'text-[hsl(var(--status-safe))]' },
  on_hold:                        { label: 'On Hold',              dotColor: 'hsl(var(--status-unsafe))',    textClass: 'text-[hsl(var(--status-unsafe))]' },
  cancelled:                      { label: 'Cancelled',            dotColor: 'hsl(var(--status-unsafe))',    textClass: 'text-[hsl(var(--status-unsafe))]' },
  // Legacy
  draft:       { label: 'Draft',       dotColor: 'hsl(var(--muted-foreground))', textClass: 'text-muted-foreground' },
  approved:    { label: 'Approved',    dotColor: 'hsl(var(--status-safe))',       textClass: 'text-[hsl(var(--status-safe))]' },
  estimated:   { label: 'Estimated',   dotColor: 'hsl(var(--status-at-risk))',    textClass: 'text-[hsl(var(--status-at-risk))]' },
  ordered:     { label: 'Ordered',     dotColor: 'hsl(var(--primary))',          textClass: 'text-primary' },
  delivered:   { label: 'Delivered',   dotColor: 'hsl(var(--status-safe))',       textClass: 'text-[hsl(var(--status-safe))]' },
};
