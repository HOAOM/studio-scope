import { useMemo } from 'react';
import { differenceInDays, parseISO } from 'date-fns';
import { GanttRow, DependencyLine } from './types';
import { ROW_HEIGHT, GROUP_HEADER_HEIGHT, LEFT_PANEL_WIDTH } from './constants';
import { dayToPercent } from './helpers';

interface Props {
  allRows: GanttRow[];
  flatVisibleRows: GanttRow[];
  timelineStart: Date;
  totalDays: number;
  containerWidth: number;
}

export function GanttDependencyArrows({ allRows, flatVisibleRows, timelineStart, totalDays, containerWidth }: Props) {
  const lines = useMemo(() => {
    const result: DependencyLine[] = [];
    allRows.forEach(row => {
      if (!row.dependsOn) return;
      const fromRow = allRows.find(r => r.id === row.dependsOn);
      if (!fromRow || !fromRow.endDate || !row.startDate) return;
      const fromIdx = flatVisibleRows.findIndex(r => r.id === fromRow.id);
      const toIdx = flatVisibleRows.findIndex(r => r.id === row.id);
      if (fromIdx < 0 || toIdx < 0) return;
      result.push({
        fromId: fromRow.id,
        toId: row.id,
        fromEndPercent: dayToPercent(differenceInDays(parseISO(fromRow.endDate), timelineStart), totalDays),
        toStartPercent: dayToPercent(differenceInDays(parseISO(row.startDate), timelineStart), totalDays),
        fromRowIndex: fromIdx,
        toRowIndex: toIdx,
      });
    });
    return result;
  }, [allRows, flatVisibleRows, timelineStart, totalDays]);

  if (lines.length === 0) return null;

  const timelineWidth = containerWidth - LEFT_PANEL_WIDTH;

  return (
    <svg
      className="absolute top-0 left-0 w-full h-full pointer-events-none"
      style={{ overflow: 'visible', zIndex: 15 }}
    >
      <defs>
        <marker
          id="gantt-arrow"
          viewBox="0 0 8 6"
          refX="7"
          refY="3"
          markerWidth="8"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L8,3 L0,6 Z" fill="hsl(var(--primary))" opacity="0.6" />
        </marker>
      </defs>
      {lines.map((line, i) => {
        const fromX = LEFT_PANEL_WIDTH + (line.fromEndPercent / 100) * timelineWidth;
        const toX = LEFT_PANEL_WIDTH + (line.toStartPercent / 100) * timelineWidth;
        const fromY = line.fromRowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
        const toY = line.toRowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

        // Curved path: from end → right → down/up → left → to start
        const midX = Math.max(fromX + 16, (fromX + toX) / 2);
        const path = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX - 4} ${toY}`;

        return (
          <path
            key={i}
            d={path}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="1.5"
            strokeOpacity="0.35"
            markerEnd="url(#gantt-arrow)"
          />
        );
      })}
    </svg>
  );
}
