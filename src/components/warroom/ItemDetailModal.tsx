/**
 * ItemDetailModal — Full-screen overlay for viewing/editing an item
 * Role-based field visibility, action buttons for state transitions, revision history, quotations
 */
import { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Database } from '@/integrations/supabase/types';
import { useUpdateProjectItem } from '@/hooks/useProjects';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import {
  LIFECYCLE_LABELS,
  LIFECYCLE_COLORS,
  getAvailableTransitions,
  getLockedFields,
  canSeeFieldGroup,
  type AppRole,
  type ItemLifecycleStatus,
} from '@/lib/workflow';
import {
  CheckCircle2, XCircle, Clock, ArrowRight, Shield, Lock,
  FileText, Package, CreditCard, Truck, Wrench, History,
  Image as ImageIcon, ExternalLink, ReceiptText,
} from 'lucide-react';
import { QuotationsTab } from './QuotationsTab';
import { RejectDialog } from './RejectDialog';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];

interface ItemDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ProjectItem | null;
  projectId: string;
}

interface AuditEntry {
  id: string;
  action: string;
  summary: string;
  created_at: string;
  user_id: string | null;
}

export function ItemDetailModal({ open, onOpenChange, item, projectId }: ItemDetailModalProps) {
  const { user } = useAuth();
  const { roles, canSeeCosts } = useUserRole();
  const updateItem = useUpdateProjectItem();
  const [rejectReason, setRejectReason] = useState('');
  const typedRoles = roles as AppRole[];

  // Fetch audit log for this item
  const { data: auditLog = [] } = useQuery({
    queryKey: ['audit_log', item?.id],
    queryFn: async () => {
      if (!item) return [];
      const { data, error } = await (supabase as any)
        .from('audit_log')
        .select('*')
        .eq('entity_id', item.id)
        .eq('entity_type', 'item')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return [];
      return (data || []) as AuditEntry[];
    },
    enabled: !!item && open,
  });

  const availableTransitions = useMemo(() => {
    if (!item) return [];
    return getAvailableTransitions(item.lifecycle_status, typedRoles);
  }, [item, typedRoles]);

  const lockedFields = useMemo(() => {
    if (!item) return [] as string[];
    return getLockedFields(item.lifecycle_status);
  }, [item]);

  const handleTransition = useCallback(async (toStatus: ItemLifecycleStatus) => {
    if (!item) return;
    try {
      await updateItem.mutateAsync({
        id: item.id,
        lifecycle_status: toStatus as any,
      });
      toast.success(`Status changed to ${LIFECYCLE_LABELS[toStatus]}`);
    } catch {
      toast.error('Failed to update status');
    }
  }, [item, updateItem]);

  if (!item) return null;

  const colors = LIFECYCLE_COLORS[item.lifecycle_status || 'concept'] || LIFECYCLE_COLORS['concept'];
  const statusLabel = LIFECYCLE_LABELS[item.lifecycle_status || 'concept'] || 'Unknown';
  const canSeeDesign = canSeeFieldGroup('design', typedRoles);
  const canSeeFinishes = canSeeFieldGroup('finishes', typedRoles);
  const canSeeProcurement = canSeeFieldGroup('procurement', typedRoles);
  const canSeePayment = canSeeFieldGroup('payment', typedRoles);
  const canSeeLogistics = canSeeFieldGroup('logistics', typedRoles);
  const canSeeInstallation = canSeeFieldGroup('installation', typedRoles);

  const renderField = (label: string, value: string | number | null | undefined, locked = false) => (
    <div className="flex justify-between items-start py-1.5">
      <span className="text-sm text-muted-foreground flex items-center gap-1">
        {locked && <Lock className="w-3 h-3" />}
        {label}
      </span>
      <span className="text-sm font-medium text-foreground text-right max-w-[60%] truncate">
        {value != null && value !== '' ? String(value) : '—'}
      </span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 gap-0 bg-card">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-bold">
                {item.item_code && (
                  <span className="font-mono text-primary mr-3">{item.item_code}</span>
                )}
                {item.description}
              </DialogTitle>
              <div className="flex items-center gap-3 mt-2">
                <Badge className={cn('text-xs', colors.bg, colors.text)}>{statusLabel}</Badge>
                {item.revision_number && (
                  <Badge variant="outline" className="text-xs font-mono">R{item.revision_number}</Badge>
                )}
                <span className="text-xs text-muted-foreground">{item.category}</span>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">{item.area}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {availableTransitions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {availableTransitions
                .filter(t => t.to !== 'on_hold' && t.to !== 'cancelled')
                .slice(0, 3)
                .map(t => (
                <Button
                  key={t.to}
                  size="sm"
                  variant={t.to === 'cancelled' ? 'destructive' : 'default'}
                  onClick={() => handleTransition(t.to)}
                  disabled={updateItem.isPending}
                >
                  <ArrowRight className="w-3 h-3 mr-1" />
                  {t.label}
                </Button>
              ))}
              {availableTransitions.filter(t => t.to === 'on_hold' || t.to === 'cancelled').map(t => (
                <Button key={t.to} size="sm" variant="outline" className={t.to === 'cancelled' ? 'text-destructive' : ''} onClick={() => handleTransition(t.to)} disabled={updateItem.isPending}>
                  {t.label}
                </Button>
              ))}
            </div>
          )}
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-200px)]">
          <Tabs defaultValue="info" className="px-6 py-4">
            <TabsList className="mb-4">
              <TabsTrigger value="info"><FileText className="w-3 h-3 mr-1" />Info</TabsTrigger>
              {canSeeDesign && <TabsTrigger value="design"><ImageIcon className="w-3 h-3 mr-1" />Design</TabsTrigger>}
              {canSeeProcurement && <TabsTrigger value="procurement"><Package className="w-3 h-3 mr-1" />Procurement</TabsTrigger>}
              {(canSeePayment || canSeeCosts) && <TabsTrigger value="finance"><CreditCard className="w-3 h-3 mr-1" />Finance</TabsTrigger>}
              {canSeeLogistics && <TabsTrigger value="logistics"><Truck className="w-3 h-3 mr-1" />Logistics</TabsTrigger>}
              {canSeeInstallation && <TabsTrigger value="installation"><Wrench className="w-3 h-3 mr-1" />Installation</TabsTrigger>}
              <TabsTrigger value="history"><History className="w-3 h-3 mr-1" />History</TabsTrigger>
            </TabsList>

            {/* INFO TAB */}
            <TabsContent value="info" className="space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-foreground mb-2">General</h4>
                  {renderField('Item Code', item.item_code)}
                  {renderField('Category', item.category)}
                  {renderField('Area', item.area, lockedFields.includes('area'))}
                  {renderField('Description', item.description, lockedFields.includes('description'))}
                  {renderField('Revision', item.revision_number ? `R${item.revision_number}` : 'R1')}
                  {renderField('BOQ Included', item.boq_included ? 'Yes' : 'No')}
                  {renderField('Approval', item.approval_status)}
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-foreground mb-2">Location</h4>
                  {renderField('Apartment', item.apartment_number)}
                  {renderField('Room Number', item.room_number)}
                  {renderField('Dimensions', item.dimensions, lockedFields.includes('dimensions'))}
                  {canSeeCosts && renderField('Quantity', item.quantity)}
                  {canSeeCosts && renderField('Unit Cost', item.unit_cost != null ? `${item.unit_cost.toFixed(2)}` : null)}
                  {canSeeCosts && renderField('Selling Price', item.selling_price != null ? `${item.selling_price.toFixed(2)}` : null)}
                </div>
              </div>
              {item.notes && (
                <div className="pt-3 border-t border-border">
                  <h4 className="text-sm font-semibold text-foreground mb-1">Notes</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.notes}</p>
                </div>
              )}
            </TabsContent>

            {/* DESIGN TAB */}
            {canSeeDesign && (
              <TabsContent value="design" className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Finishes</h4>
                    {renderField('Material', item.finish_material, lockedFields.includes('finish_material'))}
                    {renderField('Color', item.finish_color, lockedFields.includes('finish_color'))}
                    {renderField('Notes', item.finish_notes, lockedFields.includes('finish_notes'))}
                    {renderField('Production Time', item.production_time)}
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-foreground mb-2">References</h4>
                    {item.reference_image_url && (
                      <div>
                        <span className="text-xs text-muted-foreground">Reference Image</span>
                        <img src={item.reference_image_url} alt="Reference" className="w-full max-h-40 object-cover rounded-lg border border-border mt-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                    )}
                    {item.technical_drawing_url && (
                      <a href={item.technical_drawing_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                        <ExternalLink className="w-3 h-3" /> Technical Drawing
                      </a>
                    )}
                    {item.company_product_url && (
                      <a href={item.company_product_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                        <ExternalLink className="w-3 h-3" /> Company Product
                      </a>
                    )}
                  </div>
                </div>
              </TabsContent>
            )}

            {/* PROCUREMENT TAB */}
            {canSeeProcurement && (
              <TabsContent value="procurement" className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Supplier & PO</h4>
                    {renderField('Supplier', item.supplier, lockedFields.includes('supplier'))}
                    {renderField('PO Reference', item.purchase_order_ref)}
                    {renderField('Purchased', item.purchased ? 'Yes' : 'No')}
                    {renderField('Production Due', item.production_due_date)}
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Status</h4>
                    {renderField('Lifecycle', statusLabel)}
                    {renderField('Received', item.received ? 'Yes' : 'No')}
                    {renderField('Received Date', item.received_date)}
                  </div>
                </div>
              </TabsContent>
            )}

            {/* FINANCE TAB */}
            {(canSeePayment || canSeeCosts) && (
              <TabsContent value="finance" className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Costs</h4>
                    {renderField('Unit Cost', item.unit_cost != null ? item.unit_cost.toFixed(2) : null, lockedFields.includes('unit_cost'))}
                    {renderField('Quantity', item.quantity, lockedFields.includes('quantity'))}
                    {renderField('Delivery Cost', item.delivery_cost != null ? item.delivery_cost.toFixed(2) : null)}
                    {renderField('Installation Cost', item.installation_cost != null ? item.installation_cost.toFixed(2) : null)}
                    {renderField('Insurance', item.insurance_cost != null ? item.insurance_cost.toFixed(2) : null)}
                    {renderField('Duty', item.duty_cost != null ? item.duty_cost.toFixed(2) : null)}
                    {renderField('Custom Cost', item.custom_cost != null ? item.custom_cost.toFixed(2) : null)}
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Pricing</h4>
                    {renderField('Margin %', item.margin_percentage != null ? `${item.margin_percentage}%` : null)}
                    {renderField('Selling Price', item.selling_price != null ? item.selling_price.toFixed(2) : null, lockedFields.includes('selling_price'))}
                    {renderField('Total', item.unit_cost && item.quantity ? (item.unit_cost * item.quantity).toFixed(2) : null)}
                  </div>
                </div>
              </TabsContent>
            )}

            {/* LOGISTICS TAB */}
            {canSeeLogistics && (
              <TabsContent value="logistics" className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Dates</h4>
                    {renderField('Production Due', item.production_due_date)}
                    {renderField('Delivery Date', item.delivery_date)}
                    {renderField('Site Movement', item.site_movement_date)}
                    {renderField('Received Date', item.received_date)}
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Status</h4>
                    {renderField('Purchased', item.purchased ? 'Yes' : 'No')}
                    {renderField('Received', item.received ? 'Yes' : 'No')}
                    {renderField('Delivered to Site', item.lifecycle_status === 'delivered_to_site' || item.lifecycle_status === 'installation_planned' || item.lifecycle_status === 'installed' || item.lifecycle_status === 'snagging' || item.lifecycle_status === 'closed' ? 'Yes' : 'No')}
                  </div>
                </div>
              </TabsContent>
            )}

            {/* INSTALLATION TAB */}
            {canSeeInstallation && (
              <TabsContent value="installation" className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Installation</h4>
                    {renderField('Installation Start', item.installation_start_date)}
                    {renderField('Installed', item.installed ? 'Yes' : 'No')}
                    {renderField('Installed Date', item.installed_date)}
                  </div>
                </div>
              </TabsContent>
            )}

            {/* HISTORY TAB */}
            <TabsContent value="history" className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Activity Log</h4>
              {auditLog.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No activity recorded yet.</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {auditLog.map((entry: AuditEntry) => (
                    <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                      <div className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                        entry.action === 'approve' ? 'bg-status-safe-bg' :
                        entry.action === 'reject' ? 'bg-status-unsafe-bg' :
                        'bg-muted'
                      )}>
                        {entry.action === 'approve' ? <CheckCircle2 className="w-3 h-3 text-status-safe" /> :
                         entry.action === 'reject' ? <XCircle className="w-3 h-3 text-status-unsafe" /> :
                         <Clock className="w-3 h-3 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{entry.summary}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(entry.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </ScrollArea>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
