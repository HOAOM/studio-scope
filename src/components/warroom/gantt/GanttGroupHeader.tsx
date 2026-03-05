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
  const doneCount = rows.filter(r => r.status === 'done' || r.status === 'installed').length;
  const groupProgress = rows.length > 0 ? Math.round((doneCount / rows.length) * 100) : 0;

  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center border-b border-border/20 transition-colors hover:bg-muted/[0.06]"
      style={{ height: GROUP_HEADER_HEIGHT }}
    >
      <div className="flex items-center gap-2.5 px-3" style={{ width: LEFT_PANEL_WIDTH }}>
        {isCollapsed
          ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/60" />
        }
        <div className="w-[3px] h-4 rounded-full" style={{ background: gc.bar }} />
        <span className="text-[11px] font-semibold text-foreground/85 tracking-wide">
          {GROUP_LABELS[group] || group}
        </span>
        <span className="text-[10px] text-muted-foreground/50 font-mono ml-0.5">{rows.length}</span>

        {/* Progress indicator */}
        <div className="ml-auto mr-3 flex items-center gap-2">
          <div className="w-14 h-[3px] bg-muted/30 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${groupProgress}%`, background: gc.bar }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground/50 font-mono w-7 text-right">{groupProgress}%</span>
        </div>
      </div>
    </button>
  );
}
