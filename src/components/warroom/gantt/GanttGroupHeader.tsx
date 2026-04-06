import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { GanttRow } from './types';
import { GROUP_HEADER_HEIGHT, LEFT_PANEL_WIDTH, GROUP_LABELS, GROUP_COLORS } from './constants';

interface Props {
  group: string;
  rows: GanttRow[];
  isCollapsed: boolean;
  onToggle: () => void;
}

export function GanttGroupHeader({ group, rows, isCollapsed, onToggle }: Props) {
  const gc = GROUP_COLORS[group] || GROUP_COLORS.custom;
  const itemRows = rows.filter(r => r.type === 'item');
  const doneCount = itemRows.filter(r => r.status === 'installed' || r.status === 'closed' || r.status === 'done').length;
  const delayedCount = itemRows.filter(r => r.delayed).length;
  const atRiskCount = itemRows.filter(r => r.atRisk && !r.delayed).length;
  const groupProgress = itemRows.length > 0 ? Math.round((doneCount / itemRows.length) * 100) : 0;

  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center border-b border-border/15 transition-colors hover:bg-muted/[0.04]"
      style={{ height: GROUP_HEADER_HEIGHT }}
    >
      <div className="sticky left-0 z-10 flex items-center gap-2 px-3 bg-card" style={{ width: LEFT_PANEL_WIDTH }}>
        {isCollapsed
          ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" />
        }
        <div className="w-[3px] h-4 rounded-full" style={{ background: gc.bar }} />
        <span className="text-[11px] font-semibold text-foreground/80 tracking-wide">
          {GROUP_LABELS[group] || group}
        </span>
        <span className="text-[10px] text-muted-foreground/40 font-mono">{itemRows.length}</span>

        {/* Risk indicators */}
        {delayedCount > 0 && (
          <span className="text-[8px] font-semibold text-destructive bg-destructive/10 px-1 py-px rounded">{delayedCount} delayed</span>
        )}
        {atRiskCount > 0 && (
          <span className="text-[8px] font-semibold text-[hsl(var(--status-at-risk))] bg-[hsl(var(--status-at-risk))]/10 px-1 py-px rounded">{atRiskCount} at risk</span>
        )}

        {/* Progress bar */}
        <div className="ml-auto mr-3 flex items-center gap-2">
          <div className="w-12 h-[3px] bg-muted/20 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${groupProgress}%`, background: gc.bar }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground/40 font-mono w-7 text-right">{groupProgress}%</span>
        </div>
      </div>
    </button>
  );
}
