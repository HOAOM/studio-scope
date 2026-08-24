/**
 * TeamBox / UnitBox — contenitori annidati dell'organigramma v3.
 * TeamBox usa il colore della squadra reale, con il caposquadra come intestazione.
 */
import { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';

function hexToRgba(hex: string | null | undefined, alpha: number) {
  const h = (hex || '#64748b').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(100,116,139,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function DropZone({
  id, nodeId, disabled, children, className,
}: { id: string; nodeId: string | null; disabled?: boolean; children: ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { nodeId }, disabled });
  return (
    <div
      ref={setNodeRef}
      data-dropzone={nodeId ?? 'root'}
      className={cn(className, 'rounded-lg transition-shadow', isOver && 'ring-2 ring-primary ring-offset-1 ring-offset-background')}
    >
      {children}
    </div>
  );
}

export function TeamBox({
  title, color, header, children, count,
}: { title: string; color?: string | null; header?: ReactNode; children: ReactNode; count?: number }) {
  return (
    <div
      className="rounded-lg border-2 overflow-hidden min-w-[220px] shadow-sm"
      style={{ borderColor: hexToRgba(color, 0.75), background: hexToRgba(color, 0.08) }}
    >
      <div
        className="px-2.5 py-1.5 flex items-center gap-2 border-b"
        style={{ background: hexToRgba(color, 0.28), borderColor: hexToRgba(color, 0.5) }}
      >
        <Users className="h-3.5 w-3.5 shrink-0" style={{ color: color || undefined }} />
        <span className="truncate text-[11px] font-semibold uppercase tracking-wide">{title}</span>
        {typeof count === 'number' && (
          <span className="ml-auto rounded-full bg-background/60 px-1.5 text-[10px]">{count}</span>
        )}
      </div>
      {header && <div className="px-2 pt-2">{header}</div>}
      <div className="p-2 grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">{children}</div>
    </div>
  );
}

export function UnitBox({
  title, children, collapsed, onToggle, subtitle,
}: { title: string; children: ReactNode; collapsed?: boolean; onToggle?: () => void; subtitle?: string }) {
  return (
    <div className="rounded-xl border-2 border-border bg-muted/30 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 border-b border-border bg-secondary/60 px-3 py-2 text-left"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</span>
        {subtitle && <span className="text-[10px] text-muted-foreground">{subtitle}</span>}
      </button>
      {!collapsed && <div className="space-y-2 p-3">{children}</div>}
    </div>
  );
}
