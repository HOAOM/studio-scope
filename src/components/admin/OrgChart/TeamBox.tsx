/**
 * TeamBox / UnitBox — contenitori dell'organigramma v3 (resa a colonne).
 * Ogni dipartimento/squadra è una colonna verticale con intestazione colorata
 * e bordo pulito su tutti e 4 i lati; i membri scendono sotto, collegati
 * da una semplice linea verticale "a pettine" (nessun contenimento profondo).
 */
import { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';

export function hexToRgba(hex: string | null | undefined, alpha: number) {
  const h = (hex || '#64748b').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(100,116,139,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Palette di fallback per le colonne senza colore squadra. */
export const COLUMN_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#6366f1'];

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

/**
 * Lista "a pettine": linea verticale continua a sinistra + trattino
 * orizzontale per ogni elemento. Nessuna scatola annidata.
 */
export function CombList({ color, children }: { color?: string | null; children: ReactNode[] | ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  if (!items.length) return null;
  return (
    <div className="relative pl-4">
      <span
        aria-hidden
        className="absolute left-1 top-0 bottom-3 w-px"
        style={{ background: hexToRgba(color, 0.45) }}
      />
      <div className="space-y-2">
        {items.map((child, i) => (
          <div key={i} className="relative">
            <span
              aria-hidden
              className="absolute -left-3 top-6 h-px w-3"
              style={{ background: hexToRgba(color, 0.45) }}
            />
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Colonna squadra: intestazione colorata (con caposquadra dentro) + membri a pettine. */
export function TeamBox({
  title, color, header, children, count,
}: { title: string; color?: string | null; header?: ReactNode; children: ReactNode; count?: number }) {
  return (
    <div
      className="w-full overflow-hidden rounded-xl border bg-card shadow-sm"
      style={{ borderColor: hexToRgba(color, 0.55) }}
    >
      <div
        className="px-3 py-2"
        style={{ background: hexToRgba(color, 0.16), borderBottom: `1px solid ${hexToRgba(color, 0.4)}` }}
      >
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 shrink-0" style={{ color: color || undefined }} />
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide">{title}</span>
          {typeof count === 'number' && (
            <span className="ml-auto rounded-full bg-background/70 px-1.5 text-[10px] text-muted-foreground">{count}</span>
          )}
        </div>
        {header && <div className="mt-2">{header}</div>}
      </div>
      <div className="p-3">
        <CombList color={color}>{children}</CombList>
      </div>
    </div>
  );
}

/** Colonna dipartimento/area: stessa grammatica visiva della squadra. */
export function UnitBox({
  title, children, collapsed, onToggle, subtitle, color, lead,
}: {
  title: string;
  children: ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  subtitle?: string;
  color?: string | null;
  lead?: ReactNode;
}) {
  return (
    <div
      className="w-full overflow-hidden rounded-xl border bg-card shadow-sm"
      style={{ borderColor: hexToRgba(color, 0.55) }}
    >
      <div
        className="px-3 py-2"
        style={{ background: hexToRgba(color, 0.16), borderBottom: `1px solid ${hexToRgba(color, 0.4)}` }}
      >
        <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 text-left">
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          <span className="truncate text-[11px] font-bold uppercase tracking-wide text-foreground">{title}</span>
          {subtitle && <span className="truncate text-[10px] text-muted-foreground">{subtitle}</span>}
        </button>
        {!collapsed && lead && <div className="mt-2">{lead}</div>}
      </div>
      {!collapsed && (
        <div className="p-3">
          <CombList color={color}>{children}</CombList>
        </div>
      )}
    </div>
  );
}
