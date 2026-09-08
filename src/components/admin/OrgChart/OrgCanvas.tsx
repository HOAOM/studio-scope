/**
 * OrgCanvas — contenitore con zoom per l'albero dell'organigramma.
 * Solo presentazione: usa la proprietà CSS `zoom` (non `transform`) così le
 * coordinate del puntatore restano corrette per il drag & drop.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2;

const clamp = (v: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v));

export function OrgCanvas({ children }: { children: React.ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const fit = useCallback(() => {
    const vp = viewportRef.current;
    const content = contentRef.current;
    if (!vp || !content) return;
    // Larghezza reale del contenuto a zoom 1.
    const contentWidth = content.scrollWidth * zoomRef.current;
    const available = vp.clientWidth - 16;
    if (contentWidth <= 0 || available <= 0) return;
    const next = clamp(available / contentWidth);
    setZoom(next);
    requestAnimationFrame(() => {
      if (viewportRef.current) viewportRef.current.scrollLeft = 0;
    });
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      setZoom((z) => clamp(z * Math.exp(-dy * 0.0015)));
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className="relative rounded-lg border border-border bg-background/40">
      <div className="absolute right-2 top-2 z-20 flex items-center gap-1 rounded-md border border-border bg-card/95 p-1 shadow-sm backdrop-blur">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button" size="icon" variant="ghost" className="h-6 w-6"
              aria-label="Riduci zoom" data-testid="zoom-out"
              onClick={() => setZoom((z) => clamp(z - 0.1))}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Riduci (ctrl/cmd + rotellina)</TooltipContent>
        </Tooltip>
        <span className="w-10 text-center text-[10px] tabular-nums text-muted-foreground" data-testid="zoom-level">
          {Math.round(zoom * 100)}%
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button" size="icon" variant="ghost" className="h-6 w-6"
              aria-label="Aumenta zoom" data-testid="zoom-in"
              onClick={() => setZoom((z) => clamp(z + 0.1))}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ingrandisci (ctrl/cmd + rotellina)</TooltipContent>
        </Tooltip>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button" size="icon" variant="ghost" className="h-6 w-6"
              aria-label="Adatta alla vista" data-testid="zoom-fit" onClick={fit}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Adatta alla vista</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button" size="icon" variant="ghost" className="h-6 w-6"
              aria-label="Zoom 100%" data-testid="zoom-reset" onClick={() => setZoom(1)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Torna al 100%</TooltipContent>
        </Tooltip>
      </div>

      <div ref={viewportRef} className="max-h-[75vh] overflow-auto p-2">
        <div ref={contentRef} style={{ zoom }} className="min-w-max">
          {children}
        </div>
      </div>
    </div>
  );
}
