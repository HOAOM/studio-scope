/**
 * ItemDetailModal — Unified item management hub
 * Full-screen overlay for viewing/editing all item data across BOQ, Gantt, tracker, and all tabs.
 * Role-based field visibility, edit mode with Save/Cancel, action buttons for state transitions,
 * task management, revision history, quotations, item options.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useProjectTasks, useCreateTask, useUpdateTask, useDeleteTask, ProjectTask } from '@/hooks/useTasks';
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
  CheckCircle2, XCircle, Clock, ArrowRight, Lock, Pencil, Save, X,
  FileText, Package, CreditCard, Truck, Wrench, History,
  Image as ImageIcon, ExternalLink, ReceiptText, Layers,
  ListTodo, Plus, Trash2, Calendar as CalendarIcon, User,
} from 'lucide-react';
import { QuotationsTab } from './QuotationsTab';

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

export function ItemDetailModal({ open, onOpenChange, item: initialItem, projectId }: ItemDetailModalProps) {
  const { user } = useAuth();
  const { roles, canSeeCosts } = useUserRole();
  const updateItem = useUpdateProjectItem();
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Partial<ProjectItem>>({});
  const typedRoles = roles as AppRole[];

  // Fetch live item data to avoid stale state after save
  const { data: liveItem } = useQuery({
    queryKey: ['item-detail', initialItem?.id],
    queryFn: async () => {
      if (!initialItem) return null;
      const { data, error } = await supabase
        .from('project_items')
        .select('*')
        .eq('id', initialItem.id)
        .maybeSingle();
      if (error) return null;
      return data as ProjectItem | null;
    },
    enabled: !!initialItem && open,
  });

  const item = liveItem || initialItem;

  // Reset edit mode when item changes or modal closes
  useEffect(() => {
    if (!open) {
      setEditMode(false);
      setEditData({});
    }
  }, [open, initialItem?.id]);

  // Fetch child options for this item
  const { data: childOptions = [] } = useQuery({
    queryKey: ['item-options', item?.id],
    queryFn: async () => {
      if (!item) return [];
      const { data, error } = await supabase
        .from('project_items')
        .select('*')
        .eq('parent_item_id', item.id)
        .order('created_at', { ascending: true });
      if (error) return [];
      return data || [];
    },
    enabled: !!item && open,
  });

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

  // Fetch tasks linked to this item
  const { data: allTasks = [] } = useProjectTasks(projectId);
  const linkedTasks = useMemo(() => {
    if (!item) return [];
    return allTasks.filter(t => t.linked_item_id === item.id);
  }, [allTasks, item]);

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  // Fetch members for assignee display
  const { data: members = [] } = useQuery({
    queryKey: ['project-members-profiles', projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('project_members')
        .select('user_id, role, profiles:user_id(display_name, email)')
        .eq('project_id', projectId);
      if (error) return [];
      return (data || []).map((m: any) => ({
        id: m.user_id,
        display_name: m.profiles?.display_name || null,
        email: m.profiles?.email || null,
        role: m.role,
      }));
    },
    enabled: !!projectId && open,
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
      await updateItem.mutateAsync({ id: item.id, lifecycle_status: toStatus as any });
      queryClient.invalidateQueries({ queryKey: ['item-detail', item.id] });
      queryClient.invalidateQueries({ queryKey: ['project-items', projectId] });
      toast.success(`Status changed to ${LIFECYCLE_LABELS[toStatus]}`);
    } catch {
      toast.error('Failed to update status');
    }
  }, [item, updateItem, queryClient, projectId]);

  const handleEnterEdit = () => {
    if (!item) return;
    setEditData({
      description: item.description,
      area: item.area,
      supplier: item.supplier,
      dimensions: item.dimensions,
      finish_material: item.finish_material,
      finish_color: item.finish_color,
      finish_notes: item.finish_notes,
      production_time: item.production_time,
      notes: item.notes,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      selling_price: item.selling_price,
      margin_percentage: item.margin_percentage,
      delivery_cost: item.delivery_cost,
      installation_cost: item.installation_cost,
      insurance_cost: item.insurance_cost,
      duty_cost: item.duty_cost,
      custom_cost: item.custom_cost,
      reference_image_url: item.reference_image_url,
      technical_drawing_url: item.technical_drawing_url,
      company_product_url: item.company_product_url,
      production_due_date: item.production_due_date,
      delivery_date: item.delivery_date,
      site_movement_date: item.site_movement_date,
      installation_start_date: item.installation_start_date,
      po_number: item.po_number,
      quotation_ref: item.quotation_ref,
      proforma_url: item.proforma_url,
    });
    setEditMode(true);
  };

  const handleSave = async () => {
    if (!item) return;
    try {
      // Ensure numeric fields are properly typed
      const payload: Record<string, any> = { id: item.id };
      const numericFields = ['quantity', 'unit_cost', 'selling_price', 'margin_percentage', 'delivery_cost', 'installation_cost', 'insurance_cost', 'duty_cost', 'custom_cost'];
      
      for (const [key, value] of Object.entries(editData)) {
        if (numericFields.includes(key)) {
          payload[key] = value != null && value !== '' ? Number(value) : null;
        } else {
          payload[key] = value;
        }
      }

      await updateItem.mutateAsync(payload as any);
      queryClient.invalidateQueries({ queryKey: ['item-detail', item.id] });
      queryClient.invalidateQueries({ queryKey: ['project-items', projectId] });
      toast.success('Item updated successfully');
      setEditMode(false);
      setEditData({});
    } catch {
      toast.error('Failed to update item');
    }
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditData({});
  };

  const handleSelectOption = async (option: ProjectItem) => {
    if (!item) return;
    try {
      for (const child of childOptions) {
        await updateItem.mutateAsync({
          id: child.id,
          is_selected_option: child.id === option.id,
        });
      }
      toast.success(`Selected: ${option.description}`);
    } catch {
      toast.error('Failed to select option');
    }
  };

  // Quick task creation
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const handleCreateQuickTask = async () => {
    if (!item || !newTaskTitle.trim()) return;
    try {
      await createTask.mutateAsync({
        project_id: projectId,
        title: newTaskTitle.trim(),
        linked_item_id: item.id,
        macro_area: 'custom' as any,
        status: 'todo' as any,
      });
      setNewTaskTitle('');
      toast.success('Task created');
    } catch {
      toast.error('Failed to create task');
    }
  };

  const handleToggleTaskStatus = async (task: ProjectTask) => {
    if (task.completion_fields && task.completion_fields.length > 0) {
      toast.info('This task auto-completes when the required fields are filled');
      return;
    }
    const next = task.status === 'done' ? 'todo' : task.status === 'todo' ? 'in_progress' : 'done';
    try {
      await updateTask.mutateAsync({ id: task.id, projectId, status: next } as any);
    } catch { toast.error('Failed to update task'); }
  };

  const handleDeleteTask = async (task: ProjectTask) => {
    try {
      await deleteTask.mutateAsync({ id: task.id, projectId });
      toast.success('Task deleted');
    } catch { toast.error('Failed to delete task'); }
  };

  // Compute real total including all landed costs + margin (must be before early return)
  const computedTotal = useMemo(() => {
    if (!item) return { subtotal: 0, landedCost: 0, totalWithMargin: 0, margin: 0 };
    const src = editMode ? { ...item, ...editData } : item;
    const unitCost = Number(src.unit_cost) || 0;
    const qty = Number(src.quantity) || 1;
    const subtotal = unitCost * qty;
    const delivery = Number(src.delivery_cost) || 0;
    const installation = Number(src.installation_cost) || 0;
    const insurance = Number(src.insurance_cost) || 0;
    const duty = Number(src.duty_cost) || 0;
    const custom = Number(src.custom_cost) || 0;
    const landedCost = subtotal + delivery + installation + insurance + duty + custom;
    const margin = Number(src.margin_percentage) || 0;
    const totalWithMargin = landedCost * (1 + margin / 100);
    return { subtotal, landedCost, totalWithMargin, margin };
  }, [item, editData, editMode]);

  if (!item) return null;

  const colors = LIFECYCLE_COLORS[item.lifecycle_status || 'concept'] || LIFECYCLE_COLORS['concept'];
  const statusLabel = LIFECYCLE_LABELS[item.lifecycle_status || 'concept'] || 'Unknown';
  const canSeeDesign = canSeeFieldGroup('design', typedRoles);
  const canSeeFinishes = canSeeFieldGroup('finishes', typedRoles);
  const canSeeProcurement = canSeeFieldGroup('procurement', typedRoles);
  const canSeePayment = canSeeFieldGroup('payment', typedRoles);
  const canSeeLogistics = canSeeFieldGroup('logistics', typedRoles);
  const canSeeInstallation = canSeeFieldGroup('installation', typedRoles);

  const isLocked = (field: string) => lockedFields.includes(field);
  const val = (field: keyof ProjectItem) => editMode ? (editData as any)[field] : (item as any)[field];
  const setVal = (field: string, value: any) => setEditData(prev => ({ ...prev, [field]: value }));

  const getMemberName = (id: string | null) => {
    if (!id) return null;
    const m = members.find((m: any) => m.id === id);
    return m?.display_name || m?.email?.split('@')[0] || null;
  };

  const renderField = (label: string, field: keyof ProjectItem, opts?: { locked?: boolean; type?: 'text' | 'number' | 'date' | 'textarea' }) => {
    const locked = opts?.locked ?? isLocked(field);
    const fieldType = opts?.type ?? 'text';
    const value = val(field);

    if (editMode && !locked) {
      return (
        <div className="flex flex-col gap-1 py-1.5">
          <Label className="text-xs text-muted-foreground">{label}</Label>
          {fieldType === 'textarea' ? (
            <Textarea
              value={value ?? ''}
              onChange={e => setVal(field, e.target.value)}
              className="text-sm min-h-[60px]"
            />
          ) : (
            <Input
              type={fieldType}
              value={value ?? ''}
              onChange={e => setVal(field, fieldType === 'number' ? (e.target.value ? parseFloat(e.target.value) : null) : e.target.value)}
              className="text-sm h-8"
            />
          )}
        </div>
      );
    }

    return (
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
  };

  const renderLink = (label: string, field: keyof ProjectItem) => {
    const value = val(field);
    if (editMode) {
      return (
        <div className="flex flex-col gap-1 py-1.5">
          <Label className="text-xs text-muted-foreground">{label}</Label>
          <Input
            value={value ?? ''}
            onChange={e => setVal(field, e.target.value)}
            placeholder="Paste URL or file path..."
            className="text-sm h-8"
          />
        </div>
      );
    }
    if (!value) return null;
    return (
      <a href={value} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline py-1">
        <ExternalLink className="w-3 h-3" /> {label}
      </a>
    );
  };

  const openTasks = linkedTasks.filter(t => t.status !== 'done');
  const doneTasks = linkedTasks.filter(t => t.status === 'done');

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
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <Badge className={cn('text-xs', colors.bg, colors.text)}>{statusLabel}</Badge>
                {item.revision_number && item.revision_number > 1 && (
                  <Badge variant="outline" className="text-xs font-mono">R{item.revision_number}</Badge>
                )}
                <span className="text-xs text-muted-foreground">{item.category}</span>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">{item.area}</span>
                {childOptions.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    <Layers className="w-3 h-3 mr-1" />{childOptions.length} options
                  </Badge>
                )}
                {openTasks.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    <ListTodo className="w-3 h-3 mr-1" />{openTasks.length} open tasks
                  </Badge>
                )}
              </div>
            </div>
            {/* Edit / Save / Cancel buttons */}
            <div className="flex items-center gap-2">
              {editMode ? (
                <>
                  <Button size="sm" onClick={handleSave} disabled={updateItem.isPending}>
                    <Save className="w-3 h-3 mr-1" /> Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                    <X className="w-3 h-3 mr-1" /> Cancel
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={handleEnterEdit}>
                  <Pencil className="w-3 h-3 mr-1" /> Edit
                </Button>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          {!editMode && availableTransitions.length > 0 && (
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
            <TabsList className="mb-4 flex-wrap">
              <TabsTrigger value="info"><FileText className="w-3 h-3 mr-1" />Info</TabsTrigger>
              {canSeeDesign && <TabsTrigger value="design"><ImageIcon className="w-3 h-3 mr-1" />Design</TabsTrigger>}
              {canSeeProcurement && <TabsTrigger value="procurement"><Package className="w-3 h-3 mr-1" />Procurement</TabsTrigger>}
              {canSeeProcurement && <TabsTrigger value="quotations"><ReceiptText className="w-3 h-3 mr-1" />Quotations</TabsTrigger>}
              {(canSeePayment || canSeeCosts) && <TabsTrigger value="finance"><CreditCard className="w-3 h-3 mr-1" />Finance</TabsTrigger>}
              {canSeeLogistics && <TabsTrigger value="logistics"><Truck className="w-3 h-3 mr-1" />Logistics</TabsTrigger>}
              {canSeeInstallation && <TabsTrigger value="installation"><Wrench className="w-3 h-3 mr-1" />Installation</TabsTrigger>}
              <TabsTrigger value="tasks"><ListTodo className="w-3 h-3 mr-1" />Tasks{openTasks.length > 0 ? ` (${openTasks.length})` : ''}</TabsTrigger>
              {childOptions.length > 0 && <TabsTrigger value="options"><Layers className="w-3 h-3 mr-1" />Options</TabsTrigger>}
              <TabsTrigger value="history"><History className="w-3 h-3 mr-1" />History</TabsTrigger>
            </TabsList>

            {/* INFO TAB */}
            <TabsContent value="info" className="space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-foreground mb-2">General</h4>
                  {renderField('Item Code', 'item_code', { locked: true })}
                  {renderField('Category', 'category', { locked: true })}
                  {renderField('Area', 'area')}
                  {renderField('Description', 'description')}
                  {renderField('Revision', 'revision_number', { locked: true })}
                  {renderField('BOQ Included', 'boq_included', { locked: true })}
                  {renderField('Approval', 'approval_status', { locked: true })}
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-foreground mb-2">Location</h4>
                  {renderField('Apartment', 'apartment_number')}
                  {renderField('Room Number', 'room_number', { locked: true })}
                  {renderField('Dimensions', 'dimensions')}
                  {renderField('Supplier', 'supplier')}
                  {renderField('Production Time', 'production_time')}
                  {canSeeCosts && renderField('Quantity', 'quantity', { type: 'number' })}
                  {canSeeCosts && renderField('Unit Cost', 'unit_cost', { type: 'number' })}
                </div>
              </div>
              <div className="pt-3 border-t border-border">
                <h4 className="text-sm font-semibold text-foreground mb-1">Notes</h4>
                {editMode ? (
                  <Textarea
                    value={editData.notes ?? item.notes ?? ''}
                    onChange={e => setVal('notes', e.target.value)}
                    className="text-sm min-h-[60px]"
                    placeholder="Add notes..."
                  />
                ) : (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.notes || '—'}</p>
                )}
              </div>
            </TabsContent>

            {/* DESIGN TAB */}
            {canSeeDesign && (
              <TabsContent value="design" className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Finishes</h4>
                    {renderField('Material', 'finish_material')}
                    {renderField('Color', 'finish_color')}
                    {renderField('Finish Notes', 'finish_notes', { type: 'textarea' })}
                    {renderField('Production Time', 'production_time')}
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-foreground mb-2">References</h4>
                    {renderLink('Reference Image', 'reference_image_url')}
                    {renderLink('Technical Drawing', 'technical_drawing_url')}
                    {renderLink('Company Product', 'company_product_url')}
                    {!editMode && item.reference_image_url && (
                      <div className="mt-2">
                        <img src={item.reference_image_url} alt="Reference" className="w-full max-h-40 object-cover rounded-lg border border-border" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
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
                    {renderField('Supplier', 'supplier')}
                    {renderField('PO Number', 'po_number')}
                    {renderField('Quotation Ref', 'quotation_ref')}
                    {renderLink('Proforma', 'proforma_url')}
                    {renderField('Production Due', 'production_due_date', { type: 'date' })}
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Status</h4>
                    {renderField('Lifecycle', 'lifecycle_status', { locked: true })}
                    {renderField('Purchased', 'purchased', { locked: true })}
                    {renderField('Received', 'received', { locked: true })}
                    {renderField('Received Date', 'received_date', { type: 'date' })}
                  </div>
                </div>
              </TabsContent>
            )}

            {/* QUOTATIONS TAB */}
            {canSeeProcurement && (
              <TabsContent value="quotations" className="space-y-4">
                <QuotationsTab itemId={item.id} canEdit={canSeeProcurement} />
              </TabsContent>
            )}

            {/* FINANCE TAB */}
            {(canSeePayment || canSeeCosts) && (
              <TabsContent value="finance" className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Costs</h4>
                    {renderField('Unit Cost', 'unit_cost', { type: 'number' })}
                    {renderField('Quantity', 'quantity', { type: 'number' })}
                    <Separator className="my-2" />
                    {renderField('Delivery Cost', 'delivery_cost', { type: 'number' })}
                    {renderField('Installation Cost', 'installation_cost', { type: 'number' })}
                    {renderField('Insurance', 'insurance_cost', { type: 'number' })}
                    {renderField('Duty', 'duty_cost', { type: 'number' })}
                    {renderField('Custom Cost', 'custom_cost', { type: 'number' })}
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Pricing</h4>
                    {renderField('Margin %', 'margin_percentage', { type: 'number' })}
                    {renderField('Selling Price', 'selling_price', { type: 'number' })}
                    <Separator className="my-2" />
                    <div className="space-y-2 rounded-lg bg-muted/30 p-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Subtotal (unit × qty)</span>
                        <span className="text-sm font-mono font-medium text-foreground">
                          {computedTotal.subtotal > 0 ? computedTotal.subtotal.toFixed(2) : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Landed Cost (+ extras)</span>
                        <span className="text-sm font-mono font-medium text-foreground">
                          {computedTotal.landedCost > 0 ? computedTotal.landedCost.toFixed(2) : '—'}
                        </span>
                      </div>
                      <Separator />
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-foreground">
                          Total {computedTotal.margin > 0 ? `(+${computedTotal.margin}%)` : ''}
                        </span>
                        <span className="text-base font-bold font-mono text-foreground">
                          {computedTotal.totalWithMargin > 0 ? computedTotal.totalWithMargin.toFixed(2) : '—'}
                        </span>
                      </div>
                    </div>
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
                    {renderField('Production Due', 'production_due_date', { type: 'date' })}
                    {renderField('Delivery Date', 'delivery_date', { type: 'date' })}
                    {renderField('Site Movement', 'site_movement_date', { type: 'date' })}
                    {renderField('Received Date', 'received_date', { type: 'date' })}
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Status</h4>
                    {renderField('Purchased', 'purchased', { locked: true })}
                    {renderField('Received', 'received', { locked: true })}
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
                    {renderField('Installation Start', 'installation_start_date', { type: 'date' })}
                    {renderField('Installed', 'installed', { locked: true })}
                    {renderField('Installed Date', 'installed_date', { type: 'date' })}
                  </div>
                </div>
              </TabsContent>
            )}

            {/* TASKS TAB */}
            <TabsContent value="tasks" className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">
                  Tasks ({linkedTasks.length})
                </h4>
              </div>

              {/* Quick add */}
              <div className="flex gap-2">
                <Input
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  placeholder="Add a task for this item..."
                  className="text-sm h-8"
                  onKeyDown={e => e.key === 'Enter' && handleCreateQuickTask()}
                />
                <Button size="sm" className="h-8 px-3" onClick={handleCreateQuickTask} disabled={!newTaskTitle.trim() || createTask.isPending}>
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>

              {/* Open tasks */}
              {openTasks.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Open</span>
                  {openTasks.map(task => (
                    <div key={task.id} className="flex items-center gap-3 py-2 px-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
                      <button
                        onClick={() => handleToggleTaskStatus(task)}
                        className={cn(
                          'w-4 h-4 rounded-full border-2 shrink-0 transition-colors',
                          task.status === 'in_progress' ? 'border-primary bg-primary/20' : 'border-muted-foreground/30'
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-foreground">{task.title}</span>
                        {task.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          {task.assignee_id && (
                            <span className="flex items-center gap-1">
                              <User className="w-2.5 h-2.5" />{getMemberName(task.assignee_id) || 'Assigned'}
                            </span>
                          )}
                          {task.end_date && (
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="w-2.5 h-2.5" />{task.end_date}
                            </span>
                          )}
                          {task.completion_fields && task.completion_fields.length > 0 && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1">Auto-complete</Badge>
                          )}
                          <Badge variant="outline" className="text-[9px] h-4 px-1 capitalize">{task.status.replace('_', ' ')}</Badge>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteTask(task)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Done tasks */}
              {doneTasks.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Completed</span>
                  {doneTasks.map(task => (
                    <div key={task.id} className="flex items-center gap-3 py-2 px-3 rounded-lg border border-border/50 bg-muted/20">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-sm text-muted-foreground line-through flex-1">{task.title}</span>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteTask(task)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {linkedTasks.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No tasks linked to this item yet.</p>
              )}
            </TabsContent>

            {/* OPTIONS TAB */}
            {childOptions.length > 0 && (
              <TabsContent value="options" className="space-y-4">
                <h4 className="text-sm font-semibold text-foreground">Item Options ({childOptions.length})</h4>
                <p className="text-xs text-muted-foreground">Select the option the client has chosen. Only the selected option will appear in the Gantt and advance through the workflow.</p>
                <div className="grid gap-3">
                  {childOptions.map((opt, i) => (
                    <div
                      key={opt.id}
                      className={cn(
                        'rounded-lg border p-4 transition-all',
                        opt.is_selected_option
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-border bg-card hover:border-muted-foreground/30'
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">Option {i + 1}</span>
                            {opt.is_selected_option && (
                              <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Selected
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-foreground mt-1">{opt.description}</p>
                          <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                            {opt.supplier && <span>Supplier: <strong className="text-foreground">{opt.supplier}</strong></span>}
                            {opt.finish_material && <span>Material: <strong className="text-foreground">{opt.finish_material}</strong></span>}
                            {opt.finish_color && <span>Color: <strong className="text-foreground">{opt.finish_color}</strong></span>}
                            {opt.dimensions && <span>Size: <strong className="text-foreground">{opt.dimensions}</strong></span>}
                            {canSeeCosts && opt.unit_cost != null && <span>Cost: <strong className="text-foreground font-mono">{opt.unit_cost.toFixed(2)}</strong></span>}
                          </div>
                          {opt.reference_image_url && (
                            <img src={opt.reference_image_url} alt="Option" className="mt-2 h-20 w-auto object-cover rounded border border-border" />
                          )}
                        </div>
                        {!opt.is_selected_option && (
                          <Button size="sm" variant="outline" onClick={() => handleSelectOption(opt)}>
                            Select
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
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
                        entry.action === 'approve' ? 'bg-primary/10' :
                        entry.action === 'reject' ? 'bg-destructive/10' :
                        'bg-muted'
                      )}>
                        {entry.action === 'approve' ? <CheckCircle2 className="w-3 h-3 text-primary" /> :
                         entry.action === 'reject' ? <XCircle className="w-3 h-3 text-destructive" /> :
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
          {editMode ? (
            <>
              <Button variant="outline" onClick={handleCancelEdit}>Cancel</Button>
              <Button onClick={handleSave} disabled={updateItem.isPending}>
                <Save className="w-4 h-4 mr-1" /> Save Changes
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
