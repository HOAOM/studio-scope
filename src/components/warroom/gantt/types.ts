import { Database } from '@/integrations/supabase/types';
import { ProjectTask } from '@/hooks/useTasks';

export type ProjectItem = Database['public']['Tables']['project_items']['Row'];
export type ZoomLevel = 'day' | 'week' | 'month';

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
  phases?: { key: string; label: string; color: string; start: string; end: string | null; isActive?: boolean; isPast?: boolean; isFuture?: boolean }[];
  itemId?: string;
  delayed?: boolean;
  task?: ProjectTask;
  isSubTask?: boolean;
  parentItemId?: string;
  urgent?: boolean;
  gateBlocked?: boolean;
  gateReason?: string;
  gateProgress?: number;
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
