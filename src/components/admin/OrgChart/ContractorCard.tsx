/**
 * ContractorCard — scheda appaltatore esterno (fornitore con flag Subappaltatore).
 * Rappresenta un'azienda, non un elenco di dipendenti.
 */
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Building2 } from 'lucide-react';
import type { OrgNode } from '@/hooks/useOrgChartV3';

export interface Contractor {
  id: string;
  name: string;
  categories?: string[] | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
}

export function ContractorCard({
  node, supplier, draggable, onOpen,
}: {
  node: OrgNode;
  supplier?: Contractor;
  draggable?: boolean;
  onOpen: (node: OrgNode) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `node:${node.id}`,
    data: { kind: 'node', nodeId: node.id },
    disabled: !draggable,
  });

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      onClick={() => onOpen(node)}
      style={{ touchAction: 'none' }}
      className={cn(
        'w-full rounded-md border border-dashed border-border bg-secondary/40 px-2.5 py-2 text-left transition-colors hover:bg-accent/50',
        draggable && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      <span className="flex items-center gap-1.5">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="truncate text-xs font-semibold">{supplier?.name || node.title}</span>
        <span className="ml-auto rounded bg-muted px-1 text-[9px] font-semibold text-muted-foreground">EXT</span>
      </span>
      <span className="block truncate text-[10px] text-muted-foreground">
        {(supplier?.categories || []).join(', ') || node.title}
      </span>
      {(supplier?.contact_person || supplier?.phone) && (
        <span className="block truncate text-[10px] text-muted-foreground">
          {[supplier?.contact_person, supplier?.phone].filter(Boolean).join(' · ')}
        </span>
      )}
    </button>
  );
}
