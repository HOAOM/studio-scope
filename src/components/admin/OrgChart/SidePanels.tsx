/**
 * UnassignedPanel + CatalogPanel — sorgenti di drag & drop.
 */
import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Building2, GripVertical } from 'lucide-react';
import type { CatalogEntry } from '@/hooks/useOrgChartV3';
import type { DirectoryProfile } from '@/hooks/useOrgStructure';
import type { Contractor } from './ContractorCard';

function DragItem({
  id, data, children, className,
}: { id: string; data: Record<string, unknown>; children: React.ReactNode; className?: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'flex cursor-grab items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs',
        isDragging && 'opacity-40',
        className,
      )}
    >
      <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground" />
      {children}
    </div>
  );
}

export function UnassignedPanel({
  people, contractors,
}: { people: DirectoryProfile[]; contractors: Contractor[] }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Non assegnati
      </h4>
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {people.map((p) => (
          <DragItem key={p.id} id={`person:${p.id}`} data={{ kind: 'person', userId: p.id }}>
            <Avatar className="h-5 w-5">
              <AvatarImage src={p.avatar_url || undefined} alt={p.display_name || ''} />
              <AvatarFallback className="text-[9px]">
                {(p.display_name || p.email || '?').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{p.display_name || p.email}</span>
          </DragItem>
        ))}
        {contractors.map((s) => (
          <DragItem key={s.id} id={`supplier:${s.id}`} data={{ kind: 'supplier', supplierId: s.id }}>
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{s.name}</span>
            <span className="ml-auto rounded bg-muted px-1 text-[9px]">EXT</span>
          </DragItem>
        ))}
        {!people.length && !contractors.length && (
          <p className="text-[11px] text-muted-foreground">Tutti posizionati.</p>
        )}
      </div>
    </div>
  );
}

export function CatalogPanel({ entries }: { entries: CatalogEntry[] }) {
  const [q, setQ] = useState('');
  const grouped = useMemo(() => {
    const filtered = entries.filter(
      (e) => !q || e.title.toLowerCase().includes(q.toLowerCase()) || e.area.toLowerCase().includes(q.toLowerCase()),
    );
    const map = new Map<string, CatalogEntry[]>();
    filtered.forEach((e) => {
      const arr = map.get(e.area) || [];
      arr.push(e);
      map.set(e.area, arr);
    });
    return [...map.entries()];
  }, [entries, q]);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Catalogo posizioni
      </h4>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cerca ruolo o area…"
        className="mb-2 h-7 text-xs"
      />
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {grouped.map(([area, items]) => (
          <div key={area}>
            <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">{area}</p>
            <div className="space-y-1">
              {items.map((e) => (
                <DragItem
                  key={e.id}
                  id={`catalog:${e.id}`}
                  data={{ kind: 'catalog', catalogId: e.id, title: e.title, level: e.level, isLead: e.is_lead }}
                >
                  <span className="truncate">{e.title}</span>
                  {e.is_lead && <span className="ml-auto text-[9px] text-muted-foreground">lead</span>}
                </DragItem>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
