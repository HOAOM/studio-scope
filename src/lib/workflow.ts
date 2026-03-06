/**
 * Unified Workflow Constants
 * Single source of truth for lifecycle order, gates, and dependencies
 */

import { Database } from '@/integrations/supabase/types';

export type ItemLifecycleStatus = Database['public']['Enums']['item_lifecycle_status'];
export type TaskMacroArea = Database['public']['Enums']['task_macro_area'];

/**
 * Canonical lifecycle order:
 * Draft → Approved → Estimated → Ordered → Delivered → Installed
 * (on_hold can happen from any state)
 */
export const LIFECYCLE_ORDER: ItemLifecycleStatus[] = [
  'draft',
  'approved',
  'estimated',
  'ordered',
  'delivered',
  'installed',
];

export const LIFECYCLE_LABELS: Record<ItemLifecycleStatus, string> = {
  draft: 'Draft',
  approved: 'Approved',
  estimated: 'Estimated',
  ordered: 'Ordered',
  delivered: 'Delivered',
  installed: 'Installed',
  on_hold: 'On Hold',
};

export const LIFECYCLE_COLORS: Record<ItemLifecycleStatus, { bg: string; text: string; dot: string }> = {
  draft:     { bg: 'bg-muted',               text: 'text-muted-foreground',            dot: 'hsl(var(--muted-foreground))' },
  approved:  { bg: 'bg-status-safe-bg',       text: 'text-status-safe',                 dot: 'hsl(var(--status-safe))' },
  estimated: { bg: 'bg-status-at-risk-bg',    text: 'text-status-at-risk',              dot: 'hsl(var(--status-at-risk))' },
  ordered:   { bg: 'bg-primary/10',           text: 'text-primary',                     dot: 'hsl(var(--primary))' },
  delivered: { bg: 'bg-status-safe-bg',       text: 'text-status-safe',                 dot: 'hsl(var(--status-safe))' },
  installed: { bg: 'bg-status-safe-bg',       text: 'text-status-safe',                 dot: 'hsl(var(--status-safe))' },
  on_hold:   { bg: 'bg-status-unsafe-bg',     text: 'text-status-unsafe',               dot: 'hsl(var(--status-unsafe))' },
};

/** Get lifecycle index (for ordering/comparison). on_hold returns -1 */
export function getLifecycleIndex(status: ItemLifecycleStatus | null): number {
  if (!status || status === 'on_hold') return -1;
  return LIFECYCLE_ORDER.indexOf(status);
}

/** Check if an item can advance to a target lifecycle status */
export function canAdvanceTo(current: ItemLifecycleStatus | null, target: ItemLifecycleStatus): boolean {
  if (target === 'on_hold') return true;
  const currentIdx = getLifecycleIndex(current);
  const targetIdx = getLifecycleIndex(target);
  if (currentIdx < 0) return targetIdx === 0; // on_hold can go back to draft
  return targetIdx === currentIdx + 1;
}

/**
 * Gate-based blocking: maps macro areas to required lifecycle statuses.
 * A task in that macro area is "blocked" if not enough items have reached the required status.
 */
export const GATE_REQUIREMENTS: Partial<Record<TaskMacroArea, { requiredLifecycle: ItemLifecycleStatus; label: string }>> = {
  procurement:    { requiredLifecycle: 'estimated',  label: 'Items must be estimated before procurement' },
  production:     { requiredLifecycle: 'ordered',    label: 'Items must be ordered before production tracking' },
  delivery:       { requiredLifecycle: 'ordered',    label: 'Items must be ordered before delivery tracking' },
  installation:   { requiredLifecycle: 'delivered',  label: 'Items must be delivered before installation' },
  closing:        { requiredLifecycle: 'installed',  label: 'All items must be installed before closing' },
};

/** Check if a macro area is gate-blocked based on item statuses */
export function isGateBlocked(macroArea: TaskMacroArea, items: Array<{ lifecycle_status: ItemLifecycleStatus | null }>): { blocked: boolean; reason?: string; progress?: number } {
  const gate = GATE_REQUIREMENTS[macroArea];
  if (!gate || items.length === 0) return { blocked: false };
  
  const requiredIdx = LIFECYCLE_ORDER.indexOf(gate.requiredLifecycle);
  const passedCount = items.filter(i => {
    const idx = getLifecycleIndex(i.lifecycle_status);
    return idx >= requiredIdx;
  }).length;
  
  const progress = Math.round((passedCount / items.length) * 100);
  
  if (passedCount === 0) return { blocked: true, reason: gate.label, progress: 0 };
  if (passedCount < items.length) return { blocked: false, reason: `${passedCount}/${items.length} items ready`, progress };
  return { blocked: false, progress: 100 };
}

/**
 * Critical path calculation: simple longest-path through Finish-to-Start dependencies
 */
export interface CriticalPathNode {
  id: string;
  startDate: string | null;
  endDate: string | null;
  dependsOn?: string;
}

export function computeCriticalPath(nodes: CriticalPathNode[]): Set<string> {
  if (nodes.length === 0) return new Set();

  // Build adjacency: dependsOn is "this node depends on that node" (FS)
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const dependents = new Map<string, string[]>(); // parent -> children that depend on it
  
  nodes.forEach(n => {
    if (n.dependsOn && nodeMap.has(n.dependsOn)) {
      const deps = dependents.get(n.dependsOn) || [];
      deps.push(n.id);
      dependents.set(n.dependsOn, deps);
    }
  });

  // Find all end nodes (nodes with no dependents)
  const hasDependent = new Set<string>();
  nodes.forEach(n => { if (n.dependsOn) hasDependent.add(n.dependsOn); });
  
  // Calculate longest path ending at each node using memoization
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

  // Find the node with the longest path
  let maxId = '';
  let maxLen = -1;
  longestPath.forEach((len, id) => {
    if (len > maxLen) { maxLen = len; maxId = id; }
  });

  // Trace back
  const criticalSet = new Set<string>();
  let cur: string | null = maxId;
  while (cur) {
    criticalSet.add(cur);
    cur = pathParent.get(cur) || null;
  }

  return criticalSet;
}
