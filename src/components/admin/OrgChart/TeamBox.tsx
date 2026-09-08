/**
 * Primitive visive dell'organigramma v3 (resa ad albero classico).
 * Niente più contenimento annidato: restano solo la zona di rilascio e
 * gli helper di colore usati per i badge squadra.
 */
import { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';

export function hexToRgba(hex: string | null | undefined, alpha: number) {
  const h = (hex || '#64748b').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(100,116,139,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Palette di fallback per le squadre senza colore. */
export const COLUMN_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#6366f1'];

/**
 * Palette ad alto contrasto per dipartimenti/squadre su entrambi i temi.
 * Tinte volutamente distanti in tonalità e luminosità, così due gruppi
 * adiacenti non si confondono. Il colore non è mai l'unico segnale:
 * il nome del dipartimento resta sempre scritto in chiaro sulla scheda.
 */
export const DEPARTMENT_PALETTE = [
  '#60a5fa', // azzurro
  '#fbbf24', // ambra
  '#34d399', // verde acqua
  '#f472b6', // rosa
  '#a78bfa', // viola
  '#fb923c', // arancio
  '#22d3ee', // ciano
  '#f87171', // rosso chiaro
  '#a3e635', // lime
  '#e879f9', // magenta
];

/** Colore stabile e leggibile per una squadra/dipartimento, derivato dall'id. */
export function departmentColor(seed: string | null | undefined) {
  if (!seed) return DEPARTMENT_PALETTE[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return DEPARTMENT_PALETTE[h % DEPARTMENT_PALETTE.length];
}

export function DropZone({
  id, nodeId, disabled, children, className,
}: { id: string; nodeId: string | null; disabled?: boolean; children: ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { nodeId }, disabled });
  return (
    <div
      ref={setNodeRef}
      data-dropzone={nodeId ?? 'root'}
      className={cn(
        className,
        'rounded-lg transition-shadow',
        isOver && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
      )}
    >
      {children}
    </div>
  );
}
