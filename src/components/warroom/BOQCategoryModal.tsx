import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './StatusBadge';
import { ItemFormDialog } from './ItemFormDialog';
import { cn } from '@/lib/utils';
import { Database } from '@/integrations/supabase/types';
import { Edit, Image as ImageIcon, ExternalLink } from 'lucide-react';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];
type BOQCategory = Database['public']['Enums']['boq_category'];

const CATEGORY_LABELS: Record<BOQCategory, string> = {
  'joinery': 'Joinery',
  'loose-furniture': 'Loose Furniture',
  'lighting': 'Lighting',
  'finishes': 'Finishes',
  'ffe': 'FF&E',
  'accessories': 'Accessories',
  'appliances': 'Appliances',
};

interface BOQCategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: BOQCategory | null;
  items: ProjectItem[];
  projectId: string;
  canSeeCosts: boolean;
}

export function BOQCategoryModal({
  open,
  onOpenChange,
  category,
  items,
  projectId,
  canSeeCosts,
}: BOQCategoryModalProps) {
  const [editingItem, setEditingItem] = useState<ProjectItem | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  if (!category) return null;

  const categoryItems = items.filter(i => i.category === category);
  const approvedCount = categoryItems.filter(i => i.approval_status === 'approved').length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[90vw] max-h-[85vh] flex flex-col bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span>{CATEGORY_LABELS[category]}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {categoryItems.length} items • {approvedCount} approved
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            {categoryItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No items in this category.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[60px]">Image</TableHead>
                    <TableHead className="w-[90px]">Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Finish</TableHead>
                    <TableHead>Dimensions</TableHead>
                    <TableHead>Approval</TableHead>
                    <TableHead>Lifecycle</TableHead>
                    {canSeeCosts && <TableHead className="text-right">Cost</TableHead>}
                    <TableHead className="text-right w-[60px]">Edit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryItems.map((item) => {
                    const status = getItemStatus(item);
                    return (
                      <TableRow
                        key={item.id}
                        className={cn(
                          'group',
                          status === 'unsafe' && 'bg-status-unsafe-bg'
                        )}
                      >
                        {/* Reference Image */}
                        <TableCell>
                          {item.reference_image_url ? (
                            <button
                              onClick={() => setPreviewImage(item.reference_image_url)}
                              className="w-10 h-10 rounded border border-border overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                            >
                              <img
                                src={item.reference_image_url}
                                alt={item.description}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  (e.target as HTMLImageElement).parentElement!.innerHTML =
                                    '<div class="w-full h-full flex items-center justify-center bg-muted"><svg class="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>';
                                }}
                              />
                            </button>
                          ) : (
                            <div className="w-10 h-10 rounded border border-border bg-muted flex items-center justify-center">
                              <ImageIcon className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-primary">
                          {item.item_code || '-'}
                        </TableCell>
                        <TableCell className="text-sm font-medium max-w-[250px]">
                          <div className="truncate" title={item.description}>
                            {item.description}
                          </div>
                          {item.supplier && (
                            <div className="text-xs text-muted-foreground truncate">
                              {item.supplier}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.area}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="space-y-0.5">
                            {item.finish_material && (
                              <div className="text-foreground">{item.finish_material}</div>
                            )}
                            {item.finish_color && (
                              <div className="text-muted-foreground">{item.finish_color}</div>
                            )}
                            {!item.finish_material && !item.finish_color && (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {item.dimensions || '-'}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'text-xs px-2 py-1 rounded-full',
                              item.approval_status === 'approved'
                                ? 'bg-status-safe-bg text-status-safe'
                                : item.approval_status === 'rejected'
                                ? 'bg-status-unsafe-bg text-status-unsafe'
                                : 'bg-status-at-risk-bg text-status-at-risk'
                            )}
                          >
                            {item.approval_status}
                          </span>
                        </TableCell>
                        <TableCell>
                          {item.lifecycle_status ? (
                            <span className="text-xs text-muted-foreground">
                              {item.lifecycle_status.replace('_', ' ')}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        {canSeeCosts && (
                          <TableCell className="text-right font-mono text-xs">
                            {item.unit_cost != null
                              ? ((item.unit_cost) * (item.quantity || 1)).toFixed(2)
                              : '-'}
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingItem(item);
                              setEditDialogOpen(true);
                            }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Preview Modal */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-2xl bg-card border-border">
          {previewImage && (
            <div className="space-y-3">
              <img
                src={previewImage}
                alt="Reference"
                className="w-full max-h-[70vh] object-contain rounded"
              />
              <div className="flex justify-end">
                <Button variant="outline" size="sm" asChild>
                  <a href={previewImage} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open Original
                  </a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      <ItemFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        projectId={projectId}
        item={editingItem}
      />
    </>
  );
}

function getItemStatus(item: ProjectItem): 'safe' | 'at-risk' | 'unsafe' {
  if (item.approval_status === 'rejected') return 'unsafe';
  if (item.approval_status === 'pending' || item.approval_status === 'revision') return 'at-risk';
  if (item.approval_status === 'approved' && !item.purchased) return 'at-risk';
  if (item.purchased && !item.received) return 'at-risk';
  if (item.received && !item.installed) return 'at-risk';
  if (item.received && item.installed) return 'safe';
  return 'at-risk';
}
