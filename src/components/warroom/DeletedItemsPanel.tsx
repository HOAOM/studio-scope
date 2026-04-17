/**
 * DeletedItemsPanel — Admin-only soft-deleted items recovery view.
 *
 * Shows items where is_active = false. Admins can either:
 *  - Restore the item (flip is_active back to true)
 *  - Hard-delete it permanently (with two-step confirm)
 *
 * This panel is the safety net behind the soft-delete change introduced in v2.1
 * after the F00BD06-LFPF001 incident, where a hard delete cascaded a parent +
 * child option (the Dall'Agnese pouf + marble slab variant) with no recovery path.
 */
import { useState } from 'react';
import { useDeletedProjectItems, useRestoreProjectItem, useHardDeleteProjectItem } from '@/hooks/useProjects';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDeleteDialog } from '@/components/warroom/ConfirmDeleteDialog';
import { Database } from '@/integrations/supabase/types';
import { RotateCcw, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];

interface DeletedItemsPanelProps {
  projectId: string;
}

export function DeletedItemsPanel({ projectId }: DeletedItemsPanelProps) {
  const { roles } = useUserRole();
  const isAdminOrCOO = roles.includes('admin') || roles.includes('coo');
  const { data: deletedItems = [], isLoading } = useDeletedProjectItems(projectId);
  const restoreMutation = useRestoreProjectItem();
  const hardDeleteMutation = useHardDeleteProjectItem();

  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const [itemToHardDelete, setItemToHardDelete] = useState<ProjectItem | null>(null);

  // Hide entirely for non-admin/COO
  if (!isAdminOrCOO) return null;

  // Hide if there's nothing to recover (keeps the UI clean)
  if (!isLoading && deletedItems.length === 0) return null;

  const handleRestore = async (item: ProjectItem) => {
    try {
      await restoreMutation.mutateAsync({ id: item.id, projectId });
      toast.success(`Restored ${item.item_code || item.description}`);
    } catch {
      toast.error('Failed to restore item');
    }
  };

  const handleHardDeleteConfirm = async () => {
    if (!itemToHardDelete) return;
    try {
      await hardDeleteMutation.mutateAsync({ id: itemToHardDelete.id, projectId });
      toast.success('Item permanently deleted');
      setHardDeleteOpen(false);
      setItemToHardDelete(null);
    } catch {
      toast.error('Failed to permanently delete item');
    }
  };

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-foreground">Deleted Items — Recovery</h3>
        <Badge variant="outline" className="border-amber-500/40 text-amber-500">
          {deletedItems.length} archived
        </Badge>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Items deleted from the project. Admin/COO can restore or permanently remove them.
      </p>
      <div className="space-y-1.5">
        {deletedItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/60 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-foreground">
                  {item.item_code || '—'}
                </span>
                <span className="truncate text-sm text-muted-foreground">{item.description}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>{item.area}</span>
                <span>·</span>
                <span>
                  archived{' '}
                  {item.updated_at
                    ? formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })
                    : '—'}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => handleRestore(item)}
                disabled={restoreMutation.isPending}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Restore
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setItemToHardDelete(item);
                  setHardDeleteOpen(true);
                }}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Purge
              </Button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDeleteDialog
        open={hardDeleteOpen}
        onOpenChange={setHardDeleteOpen}
        itemLabel={itemToHardDelete?.item_code || itemToHardDelete?.description}
        description="This is a HARD DELETE. The row and all child options will be removed from the database forever — no further recovery."
        cascadeWarning="Permanent removal. Audit log will keep a trace of the deletion event but the item data is unrecoverable."
        onConfirm={handleHardDeleteConfirm}
        isPending={hardDeleteMutation.isPending}
      />
    </div>
  );
}
