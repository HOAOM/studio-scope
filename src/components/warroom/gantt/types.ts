import { Database } from '@/integrations/supabase/types';
import { ProjectTask } from '@/hooks/useTasks';

export type ProjectItem = Database['public']['Tables']['project_items']['Row'];
export type ZoomLevel = 'day' | 'week' | 'month';

export type ItemTag = 'on_hold' | 'cancelled' | 'at_risk' | 'delayed' | 'options' | 'revision';

export interface GateMarker {
  key: string;
  label: string;
  status: 'pending' | 'approved' | 'blocked' | 'overdue';
}

export interface PhaseSegment {
  key: string;
  label: string;
  color: string;
  start: string;
  end: string | null;
  isActive?: boolean;
  isPast?: boolean;
  isFuture?: boolean;
  /** Baseline (original plan) start/end */
  baselineStart?: string;
  baselineEnd?: string;
  /** Actual progress ratio within this phase (0-1) */
  actualProgress?: number;
  /** Gate markers within this phase */
  gates?: GateMarker[];
  /** At-risk: >90% time consumed */
  atRisk?: boolean;
  /** Delayed: past deadline */
  delayed?: boolean;
}

export interface GanttRow {
  id: string;
  type: 'task' | 'item';
  label: string;
  sublabel?: string;
  group: string;
  status: string;
  assignee?: string;
  startDate: string | null;
  endDate: string | null;
  progress: number;
  dependsOn?: string;
  phases?: PhaseSegment[];
  itemId?: string;
  delayed?: boolean;
  atRisk?: boolean;
  task?: ProjectTask;
  isSubTask?: boolean;
  parentItemId?: string;
  urgent?: boolean;
  /** Visual tags */
  tags?: ItemTag[];
  /** Revision number if > 1 */
  revisionNumber?: number;
  /** Has unselected options */
  hasOptions?: boolean;
  /** Is on hold */
  isOnHold?: boolean;
  /** Is cancelled */
  isCancelled?: boolean;
  /** Waiting for: derived from lifecycle or manual */
  waitingFor?: 'client' | 'supplier' | null;
  /** Number of linked tasks */
  taskCount?: number;
  /** Number of incomplete tasks */
  openTaskCount?: number;
  /** Number of notes/comments */
  noteCount?: number;
  /** Item category */
  category?: string;
}

export interface TimelineColumn {
  label: string;
  sub?: string;
  startDay: number;
  widthDays: number;
  isWeekend?: boolean;
}

export interface TimelineMonthColumn {
  label: string;
  startDay: number;
  widthDays: number;
}

export interface DragState {
  rowId: string;
  edge: 'start' | 'end' | 'move';
  initialX: number;
  initialStart: string;
  initialEnd: string;
}

export interface DependencyLine {
  fromId: string;
  toId: string;
  fromEndPercent: number;
  toStartPercent: number;
  fromRowIndex: number;
  toRowIndex: number;
}

export type QuickFilter = 'all' | 'waiting_for_me' | 'waiting_from_client' | 'waiting_from_supplier' | 'delayed' | 'at_risk' | 'on_hold' | 'cancelled';
