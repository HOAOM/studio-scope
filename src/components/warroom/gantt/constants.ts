export const ROW_HEIGHT = 40;
export const GROUP_HEADER_HEIGHT = 36;
export const LEFT_PANEL_WIDTH = 420;
export const MIN_CHART_WIDTH = 700;

export const GROUP_ORDER = [
  'planning', 'design_validation', 'procurement', 'production',
  'delivery', 'installation', 'closing', 'custom',
  'items_joinery', 'items_loose-furniture', 'items_lighting',
  'items_finishes', 'items_ffe', 'items_accessories', 'items_appliances',
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
  items_joinery: 'Joinery Items',
  'items_loose-furniture': 'Loose Furniture',
  items_lighting: 'Lighting Items',
  items_finishes: 'Finishes',
  items_ffe: 'FF&E Items',
  items_accessories: 'Accessories',
  items_appliances: 'Appliances',
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
  items_joinery:          { hue: '25',  bar: 'hsl(25, 70%, 52%)',  barGradient: 'linear-gradient(135deg, hsl(25,70%,48%), hsl(25,70%,58%))' },
  'items_loose-furniture':{ hue: '172', bar: 'hsl(172, 55%, 45%)', barGradient: 'linear-gradient(135deg, hsl(172,55%,40%), hsl(172,55%,52%))' },
  items_lighting:         { hue: '45',  bar: 'hsl(45, 85%, 50%)',  barGradient: 'linear-gradient(135deg, hsl(45,85%,45%), hsl(45,85%,58%))' },
  items_finishes:         { hue: '330', bar: 'hsl(330, 60%, 55%)', barGradient: 'linear-gradient(135deg, hsl(330,60%,50%), hsl(330,60%,62%))' },
  items_ffe:              { hue: '85',  bar: 'hsl(85, 55%, 45%)',  barGradient: 'linear-gradient(135deg, hsl(85,55%,40%), hsl(85,55%,52%))' },
  items_accessories:      { hue: '200', bar: 'hsl(200, 70%, 55%)', barGradient: 'linear-gradient(135deg, hsl(200,70%,50%), hsl(200,70%,62%))' },
  items_appliances:       { hue: '0',   bar: 'hsl(0, 65%, 55%)',  barGradient: 'linear-gradient(135deg, hsl(0,65%,50%), hsl(0,65%,62%))' },
};

export const ITEM_PHASE_STYLES: Record<string, { gradient: string; label: string; color: string }> = {
  production: { gradient: 'linear-gradient(135deg, hsl(245,55%,50%), hsl(245,55%,62%))', label: 'Production', color: 'hsl(245,55%,58%)' },
  transit:    { gradient: 'linear-gradient(135deg, hsl(38,85%,48%), hsl(38,85%,60%))',    label: 'Transit',    color: 'hsl(38,85%,52%)' },
  site:       { gradient: 'linear-gradient(135deg, hsl(270,50%,48%), hsl(270,50%,60%))',  label: 'Site Move',  color: 'hsl(270,50%,55%)' },
  install:    { gradient: 'linear-gradient(135deg, hsl(155,60%,38%), hsl(155,60%,50%))',  label: 'Install',    color: 'hsl(155,60%,45%)' },
};

export const STATUS_CONFIG: Record<string, { label: string; dotColor: string; textClass: string }> = {
  todo:        { label: 'To Do',       dotColor: 'hsl(var(--muted-foreground))', textClass: 'text-muted-foreground' },
  in_progress: { label: 'In Progress', dotColor: 'hsl(var(--primary))',          textClass: 'text-primary' },
  done:        { label: 'Done',        dotColor: 'hsl(var(--status-safe))',       textClass: 'text-[hsl(var(--status-safe))]' },
  blocked:     { label: 'Blocked',     dotColor: 'hsl(var(--status-unsafe))',     textClass: 'text-[hsl(var(--status-unsafe))]' },
  draft:       { label: 'Draft',       dotColor: 'hsl(var(--muted-foreground))', textClass: 'text-muted-foreground' },
  estimated:   { label: 'Estimated',   dotColor: 'hsl(var(--status-at-risk))',    textClass: 'text-[hsl(var(--status-at-risk))]' },
  approved:    { label: 'Approved',    dotColor: 'hsl(var(--status-safe))',       textClass: 'text-[hsl(var(--status-safe))]' },
  ordered:     { label: 'Ordered',     dotColor: 'hsl(var(--primary))',          textClass: 'text-primary' },
  delivered:   { label: 'Delivered',   dotColor: 'hsl(var(--status-safe))',       textClass: 'text-[hsl(var(--status-safe))]' },
  installed:   { label: 'Installed',   dotColor: 'hsl(var(--status-safe))',       textClass: 'text-[hsl(var(--status-safe))]' },
  on_hold:     { label: 'On Hold',     dotColor: 'hsl(var(--status-unsafe))',     textClass: 'text-[hsl(var(--status-unsafe))]' },
};
