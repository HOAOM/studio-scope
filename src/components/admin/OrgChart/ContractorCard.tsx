/**
 * ContractorCard — scheda appaltatore esterno (fornitore con flag Subappaltatore).
 * Maniglia di trascinamento separata dal click di apertura.
 */
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Building2 } from 'lucide-react';
import type { OrgNode } from '@/hooks/useOrgChartV3';
import { DragHandle } from './PersonCard';

export interface Contractor {
  id: string;
  name: string;
  categories?: string[] | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
}

export function ContractorCard({
  node, supplier, draggable, canEdit = false, onOpen,
}: {
  node: OrgNode;
  supplier?: Contractor;
  draggable?: boolean;
  canEdit?: boolean;
  onOpen: (node: OrgNode) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: `node:${node.id}`,
    data: { kind: 'node', nodeId: node.id },
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), zIndex: isDragging ? 50 : undefined }}
      className={cn(
        'flex w-full items-start gap-1 rounded-md border border-dashed border-border bg-secondary/40 px-1.5 py-2',
        isDragging && 'opacity-70 shadow-lg ring-1 ring-primary',
      )}
    >
      <DragHandle
        nodeId={node.id}
        draggable={!!draggable}
        canEdit={canEdit}
        setNodeRef={setActivatorNodeRef}
        listeners={listeners}
        attributes={attributes}
      />
      <button
        type="button"
        onClick={() => onOpen(node)}
        className="min-w-0 flex-1 rounded px-1 text-left transition-colors hover:bg-accent/50"
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
    </div>
  );
}
