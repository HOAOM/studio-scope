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
import { useUpdateProjectItem, useCreateProjectItem } from '@/hooks/useProjects';
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
  getMacroPhase,
  type AppRole,
  type ItemLifecycleStatus,
} from '@/lib/workflow';
import {
  CheckCircle2, XCircle, Clock, ArrowRight, Lock, Pencil, Save, X,
  FileText, Package, CreditCard, Truck, Wrench, History,
  Image as ImageIcon, ExternalLink, ReceiptText, Layers,
  ListTodo, Plus, Trash2, Calendar as CalendarIcon, User,
  AlertTriangle, Shield, ArrowLeft, TrendingUp,
} from 'lucide-react';
import { QuotationsTab } from './QuotationsTab';
import { OptionCard } from './OptionCard';
import { ItemDocuments } from './ItemDocuments';
import { LifecycleChecklist } from './LifecycleChecklist';
import { FileOrUrlInput } from './FileOrUrlInput';
import { DynamicFinishes, DynamicFinish } from './DynamicFinishes';

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

// Color mapping for transition buttons based on target status macro-phase
function getTransitionButtonStyle(toStatus: string): string {
  const phase = getMacroPhase(toStatus as ItemLifecycleStatus);
  switch (phase) {
    case 'design_validation': return 'bg-blue-600 hover:bg-blue-700 text-white';
    case 'procurement': return 'bg-orange-600 hover:bg-orange-700 text-white';
    case 'production': return 'bg-cyan-600 hover:bg-cyan-700 text-white';
    case 'delivery': return 'bg-indigo-600 hover:bg-indigo-700 text-white';
    case 'installation': return 'bg-emerald-600 hover:bg-emerald-700 text-white';
    case 'closing': return 'bg-green-700 hover:bg-green-800 text-white';
    default: return 'bg-primary hover:bg-primary/90 text-primary-foreground';
  }
}

function isBackwardTransition(label: string): boolean {
  const lower = label.toLowerCase();
  return lower.includes('reject') || lower.includes('back') || lower.includes('return') || lower.includes('re-propose');
}

export function ItemDetailModal({ open, onOpenChange, item: initialItem, projectId }: ItemDetailModalProps) {
  const { user } = useAuth();
  const { roles, canSeeCosts } = useUserRole();
  const updateItem = useUpdateProjectItem();
  const createItem = useCreateProjectItem();
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const typedRoles = roles as AppRole[];

  // Fetch live item data
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

  useEffect(() => {
    if (!open) {
      setEditMode(false);
      setEditData({});
    }
  }, [open, initialItem?.id]);

  // Fetch child options
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

  // Fetch audit log
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

  // Fetch members
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

  // Fetch supplier payments for this item
  const { data: supplierPayments = [] } = useQuery({
    queryKey: ['supplier-payments', item?.id],
    queryFn: async () => {
      if (!item) return [];
      const { data, error } = await supabase
        .from('supplier_payments')
        .select('*')
        .eq('project_item_id', item.id)
        .order('payment_number', { ascending: true });
      if (error) return [];
      return data || [];
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
    const allOpts = [item, ...childOptions.slice(0, 3)];
    const selOpt = allOpts.find(o => o.is_selected_option);
    const src = (selOpt && selOpt.id !== item.id) ? selOpt : item;
    setEditData({
      description: src.description,
      area: src.area,
      supplier: src.supplier,
      dimensions: src.dimensions,
      finish_material: src.finish_material,
      finish_color: src.finish_color,
      finish_notes: src.finish_notes,
      production_time: src.production_time,
      notes: src.notes,
      quantity: src.quantity,
      unit_cost: src.unit_cost,
      selling_price: item.selling_price,
      margin_percentage: item.margin_percentage,
      delivery_cost: item.delivery_cost,
      installation_cost: item.installation_cost,
      insurance_cost: item.insurance_cost,
      duty_cost: item.duty_cost,
      custom_cost: item.custom_cost,
      boxing_cost: (item as any).boxing_cost,
      shifting_cost: (item as any).shifting_cost,
      extra_safe_cost: (item as any).extra_safe_cost,
      reference_image_url: src.reference_image_url,
      technical_drawing_url: src.technical_drawing_url,
      company_product_url: src.company_product_url,
      production_due_date: item.production_due_date,
      delivery_date: item.delivery_date,
      site_movement_date: item.site_movement_date,
      installation_start_date: item.installation_start_date,
      po_number: item.po_number,
      quotation_ref: item.quotation_ref,
      proforma_url: item.proforma_url,
      budget_estimate: (item as any).budget_estimate,
    });
    setEditMode(true);
  };

  const handleSave = async () => {
    if (!item) return;
    try {
      const payload: Record<string, any> = { id: item.id };
      const numericFields = ['quantity', 'unit_cost', 'selling_price', 'margin_percentage', 'delivery_cost', 'installation_cost', 'insurance_cost', 'duty_cost', 'custom_cost', 'boxing_cost', 'shifting_cost', 'extra_safe_cost', 'budget_estimate'];
      
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

  const handleAddOption = async () => {
    if (!item || childOptions.length >= 3) {
      toast.error('Maximum 4 options (including original)');
      return;
    }
    try {
      const letter = String.fromCharCode(66 + childOptions.length);
      await createItem.mutateAsync({
        project_id: projectId,
        parent_item_id: item.id,
        category: item.category,
        area: item.area,
        description: `${item.description} — Option ${letter}`,
        boq_included: false,
        is_selected_option: false,
        floor_id: item.floor_id,
        room_id: item.room_id,
        item_type_id: item.item_type_id,
        subcategory_id: item.subcategory_id,
        room_number: item.room_number,
      } as any);
      queryClient.invalidateQueries({ queryKey: ['item-options', item.id] });
      queryClient.invalidateQueries({ queryKey: ['project-items', projectId] });
      toast.success(`Option ${letter} added`);
    } catch {
      toast.error('Failed to add option');
    }
  };

  const handleSelectAnyOption = async (opt: ProjectItem) => {
    if (!item) return;
    try {
      const isParent = opt.id === item.id;
      const isAlreadySelected = isParent ? !!item.is_selected_option : !!opt.is_selected_option;

      await updateItem.mutateAsync({
        id: item.id,
        is_selected_option: isParent ? !isAlreadySelected : false,
      });

      for (const child of childOptions) {
        await updateItem.mutateAsync({
          id: child.id,
          is_selected_option: !isParent && child.id === opt.id ? !isAlreadySelected : false,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['item-options', item.id] });
      queryClient.invalidateQueries({ queryKey: ['item-detail', item.id] });
      queryClient.invalidateQueries({ queryKey: ['project-items', projectId] });
      toast.success(isAlreadySelected ? 'Selection cleared' : `Selected: ${opt.description}`);
    } catch {
      toast.error('Failed to update selection');
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

  const OPTION_FIELDS_SET = new Set([
    'description', 'supplier', 'dimensions', 'finish_material', 'finish_color',
    'finish_notes', 'production_time', 'reference_image_url', 'technical_drawing_url',
    'company_product_url', 'unit_cost', 'quantity', 'notes',
  ]);

  const openTasks = linkedTasks.filter(t => t.status !== 'done');
  const doneTasks = linkedTasks.filter(t => t.status === 'done');
  const allOptions = item ? [item, ...childOptions.slice(0, 3)] : [];
  const selectedOption = allOptions.find(o => o.is_selected_option);

  const effectiveItem = useMemo(() => {
    if (!item || !selectedOption || selectedOption.id === item.id) return item;
    const merged = { ...item };
    for (const field of ['description', 'supplier', 'dimensions', 'finish_material', 'finish_color',
      'finish_notes', 'production_time', 'reference_image_url', 'technical_drawing_url',
      'company_product_url', 'unit_cost', 'quantity', 'notes']) {
      const optVal = (selectedOption as any)[field];
      if (optVal != null && optVal !== '') (merged as any)[field] = optVal;
    }
    return merged;
  }, [item, selectedOption]);

  const computedTotalFn = (srcItem: ProjectItem | null, isEditMode: boolean, ed: Record<string, any>) => {
    if (!srcItem) return { subtotal: 0, landedCost: 0, totalWithMargin: 0, margin: 0 };
    const src = isEditMode ? { ...srcItem, ...ed } : srcItem;
    const unitCost = Number((src as any).unit_cost) || 0;
    const qty = Number((src as any).quantity) || 1;
    const subtotal = unitCost * qty;
    const delivery = Number((src as any).delivery_cost) || 0;
    const installation = Number((src as any).installation_cost) || 0;
    const insurance = Number((src as any).insurance_cost) || 0;
    const duty = Number((src as any).duty_cost) || 0;
    const custom = Number((src as any).custom_cost) || 0;
    const boxing = Number((src as any).boxing_cost) || 0;
    const shifting = Number((src as any).shifting_cost) || 0;
    const extraSafe = Number((src as any).extra_safe_cost) || 0;
    const landedCost = subtotal + delivery + installation + insurance + duty + custom + boxing + shifting + extraSafe;
    const margin = Number((src as any).margin_percentage) || 0;
    const totalWithMargin = landedCost * (1 + margin / 100);
    return { subtotal, landedCost, totalWithMargin, margin };
  };

  const DESIGN_APPROVAL_KEYS = ['dimensions', 'material', 'color_finish', 'client_selection'] as const;
  type DesignApprovalKey = typeof DESIGN_APPROVAL_KEYS[number];

  const { data: designApprovals = {} as Record<DesignApprovalKey, { user_id: string; display_name: string; created_at: string } | null> } = useQuery({
    queryKey: ['design-approvals', item?.id],
    queryFn: async () => {
      if (!item) {
        return {} as Record<DesignApprovalKey, { user_id: string; display_name: string; created_at: string } | null>;
      }

      const result: Record<string, any> = {};
      for (const key of DESIGN_APPROVAL_KEYS) {
        const { data } = await (supabase as any)
          .from('audit_log')
          .select('action, user_id, created_at')
          .eq('entity_id', item.id)
          .eq('entity_type', 'item')
          .in('action', [`design_approve_${key}`, `design_revoke_${key}`])
          .order('created_at', { ascending: false })
          .limit(1);

        if (data && data.length > 0 && data[0].action === `design_approve_${key}`) {
          const member = members.find((m: any) => m.id === data[0].user_id);
          result[key] = {
            user_id: data[0].user_id,
            display_name: member?.display_name || member?.email || 'Unknown',
            created_at: data[0].created_at,
          };
        } else {
          result[key] = null;
        }
      }

      return result as Record<DesignApprovalKey, { user_id: string; display_name: string; created_at: string } | null>;
    },
    enabled: !!item && open && members.length > 0,
  });

  const computedTotal = computedTotalFn(effectiveItem, editMode, editData);

  // --- Early return AFTER all hooks ---
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

  const _allOpts = [item, ...childOptions.slice(0, 3)];
  const _selOpt = _allOpts.find(o => o.is_selected_option);
  const _optSource = (_selOpt && _selOpt.id !== item.id) ? _selOpt : null;

  const val = (field: string) => {
    if (editMode) return (editData as any)[field];
    if (_optSource && OPTION_FIELDS_SET.has(field)) {
      const optVal = (_optSource as any)[field];
      if (optVal != null && optVal !== '') return optVal;
    }
    return (item as any)[field];
  };
  const setVal = (field: string, value: any) => setEditData(prev => ({ ...prev, [field]: value }));

  const getMemberName = (id: string | null) => {
    if (!id) return null;
    const m = members.find((m: any) => m.id === id);
    return m?.display_name || m?.email?.split('@')[0] || null;
  };

  const renderField = (label: string, field: string, opts?: { locked?: boolean; type?: 'text' | 'number' | 'date' | 'textarea' }) => {
    const locked = opts?.locked ?? isLocked(field);
    const fieldType = opts?.type ?? 'text';
    const value = val(field);

    if (editMode && !locked) {
      return (
        <div className="flex flex-col gap-1 py-1.5">
          <Label className="text-xs text-muted-foreground">{label}</Label>
          {fieldType === 'textarea' ? (
            <Textarea value={value ?? ''} onChange={e => setVal(field, e.target.value)} className="text-sm min-h-[60px]" />
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

  const renderLink = (label: string, field: string) => {
    const value = val(field);
    if (editMode) {
      return (
        <FileOrUrlInput
          label={label}
          value={value ?? null}
          onChange={v => setVal(field, v || '')}
          storagePath={`${projectId}/${item.id}`}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          className="py-1.5"
        />
      );
    }
    if (!value) return null;
    return (
      <a href={value} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline py-1">
        <ExternalLink className="w-3 h-3" /> {label}
      </a>
    );
  };

  // ═══ Design approval helpers ═══
  // Role-based: HoD/CEO/COO/admin/project_manager can approve design, accountant approves budget
  const DESIGN_APPROVER_ROLES: AppRole[] = ['admin', 'ceo', 'coo', 'head_of_design', 'project_manager'];
  const canApproveDesign = typedRoles.some(r => DESIGN_APPROVER_ROLES.includes(r));

  const designChecks = {
    hasDimensions: !!(selectedOption?.dimensions || item.dimensions),
    hasMaterial: !!(selectedOption?.finish_material || item.finish_material),
    hasColor: !!(selectedOption?.finish_color || item.finish_color),
    hasSelection: !!selectedOption,
  };

  const handleDesignApprove = async (key: DesignApprovalKey) => {
    if (!item || !user) return;
    try {
      await (supabase as any).from('audit_log').insert({
        entity_type: 'item',
        entity_id: item.id,
        action: `design_approve_${key}`,
        user_id: user.id,
        summary: `Design approval: ${key} approved for ${item.item_code || item.description}`,
      });
      queryClient.invalidateQueries({ queryKey: ['design-approvals', item.id] });
      queryClient.invalidateQueries({ queryKey: ['audit-log', item.id] });
      toast.success(`${key.replace(/_/g, ' ')} approved`);

      // Check if all 4 are now approved → auto-advance
      const updatedApprovals = { ...designApprovals, [key]: { user_id: user.id, display_name: '', created_at: '' } };
      const allApproved = DESIGN_APPROVAL_KEYS.every(k => updatedApprovals[k] != null);
      const allDataPresent = designChecks.hasDimensions && designChecks.hasMaterial && designChecks.hasColor && designChecks.hasSelection;
      if (allApproved && allDataPresent) {
        const designStatuses = ['draft', 'concept', 'in_design', 'design_ready', 'finishes_proposed', 'finishes_approved_designer'];
        if (designStatuses.includes(item.lifecycle_status || '')) {
          await updateItem.mutateAsync({ id: item.id, lifecycle_status: 'finishes_approved_hod' as any, approval_status: 'approved' as any });
          queryClient.invalidateQueries({ queryKey: ['item-detail', item.id] });
          queryClient.invalidateQueries({ queryKey: ['project-items', projectId] });
          toast.success('All design approvals complete — advanced to next stage');
        }
      }
    } catch { toast.error('Failed to approve'); }
  };

  const handleDesignRevoke = async (key: DesignApprovalKey) => {
    if (!item || !user) return;
    try {
      await (supabase as any).from('audit_log').insert({
        entity_type: 'item',
        entity_id: item.id,
        action: `design_revoke_${key}`,
        user_id: user.id,
        summary: `Design approval revoked: ${key} for ${item.item_code || item.description}`,
      });
      queryClient.invalidateQueries({ queryKey: ['design-approvals', item.id] });
      queryClient.invalidateQueries({ queryKey: ['audit-log', item.id] });
      toast.info(`${key.replace(/_/g, ' ')} approval revoked`);
    } catch { toast.error('Failed to revoke'); }
  };

  // Budget comparison for quotations
  const budgetEstimate = Number((item as any).budget_estimate) || 0;
  const selectedUnitCost = selectedOption ? Number(selectedOption.unit_cost || 0) : Number(item.unit_cost || 0);
  const selectedQty = selectedOption ? Number(selectedOption.quantity || 1) : Number(item.quantity || 1);
  const selectedTotal = selectedUnitCost * selectedQty;
  const budgetDiff = budgetEstimate > 0 && selectedTotal > 0 ? selectedTotal - budgetEstimate : null;

  // Forward transitions grouped
  const forwardTransitions = availableTransitions.filter(t => t.to !== 'on_hold' && t.to !== 'cancelled' && !isBackwardTransition(t.label));
  const backwardTransitions = availableTransitions.filter(t => t.to !== 'on_hold' && t.to !== 'cancelled' && isBackwardTransition(t.label));
  const specialTransitions = availableTransitions.filter(t => t.to === 'on_hold' || t.to === 'cancelled');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] h-[95vh] p-0 gap-0 bg-card flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-bold">
                {item.item_code && (
                  <span className="font-mono text-primary mr-3">{item.item_code}</span>
                )}
                {val('description')}
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

          {/* ALL transition buttons with distinct colors */}
          {!editMode && availableTransitions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {/* Forward transitions — colored by phase */}
              {forwardTransitions.map(t => (
                <Button
                  key={t.to}
                  size="sm"
                  className={cn('h-8', getTransitionButtonStyle(t.to))}
                  onClick={() => handleTransition(t.to)}
                  disabled={updateItem.isPending}
                >
                  <ArrowRight className="w-3 h-3 mr-1" />
                  {t.label}
                </Button>
              ))}

              {/* Backward/reject transitions — outlined red */}
              {backwardTransitions.map(t => (
                <Button
                  key={t.to + '_back'}
                  size="sm"
                  variant="outline"
                  className="h-8 text-red-600 border-red-300 hover:bg-red-50"
                  onClick={() => handleTransition(t.to)}
                  disabled={updateItem.isPending}
                >
                  <ArrowLeft className="w-3 h-3 mr-1" />
                  {t.label}
                </Button>
              ))}

              <div className="flex-1" />

              {/* On Hold */}
              {specialTransitions.filter(t => t.to === 'on_hold').map(t => (
                <Button key={t.to} size="sm" variant="outline" className="h-8 text-amber-600 border-amber-300 hover:bg-amber-50" onClick={() => handleTransition(t.to)} disabled={updateItem.isPending}>
                  ⏸ {t.label}
                </Button>
              ))}
              {/* Cancel */}
              {specialTransitions.filter(t => t.to === 'cancelled').map(t => (
                <Button key={t.to} size="sm" variant="outline" className="h-8 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleTransition(t.to)} disabled={updateItem.isPending}>
                  ✕ {t.label}
                </Button>
              ))}
            </div>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <Tabs defaultValue="info" className="px-6 py-4">
            <TabsList className="mb-4 flex-wrap">
              <TabsTrigger value="info"><FileText className="w-3 h-3 mr-1" />Info</TabsTrigger>
              {canSeeDesign && <TabsTrigger value="design"><ImageIcon className="w-3 h-3 mr-1" />Design</TabsTrigger>}
              {canSeeProcurement && <TabsTrigger value="quotations"><ReceiptText className="w-3 h-3 mr-1" />Quotations</TabsTrigger>}
              {canSeeProcurement && <TabsTrigger value="procurement"><Package className="w-3 h-3 mr-1" />Procurement</TabsTrigger>}
              {(canSeePayment || canSeeCosts) && <TabsTrigger value="finance"><CreditCard className="w-3 h-3 mr-1" />Finance</TabsTrigger>}
              {canSeeLogistics && <TabsTrigger value="logistics"><Truck className="w-3 h-3 mr-1" />Logistics</TabsTrigger>}
              {canSeeInstallation && <TabsTrigger value="installation"><Wrench className="w-3 h-3 mr-1" />Installation</TabsTrigger>}
              {/* Lifecycle moved to Info tab */}
              <TabsTrigger value="tasks"><ListTodo className="w-3 h-3 mr-1" />Tasks{openTasks.length > 0 ? ` (${openTasks.length})` : ''}</TabsTrigger>
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
                  <Textarea value={val('notes') ?? ''} onChange={e => setVal('notes', e.target.value)} className="text-sm min-h-[60px]" placeholder="Add notes..." />
                ) : (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{val('notes') || '—'}</p>
                )}
              </div>

              {/* Lifecycle Checklist — embedded in Info tab */}
              <div className="pt-4 border-t border-border">
                <h4 className="text-sm font-semibold text-foreground mb-1">Lifecycle Progress</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Green = done, highlighted = current, gray = upcoming.
                </p>
                <LifecycleChecklist
                  currentStatus={item.lifecycle_status}
                  userRoles={typedRoles}
                  onTransition={handleTransition}
                  isPending={updateItem.isPending}
                />
              </div>
            </TabsContent>

            {/* ═══ DESIGN TAB ═══ */}
            {canSeeDesign && (
              <TabsContent value="design" className="space-y-5">
                {/* Design Approval Checklist */}
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Shield className="w-3 h-3" /> Design Approvals
                  </h4>
                  <div className="grid grid-cols-4 gap-1">
                    {([
                      { key: 'dimensions' as DesignApprovalKey, label: 'Dim', present: designChecks.hasDimensions },
                      { key: 'material' as DesignApprovalKey, label: 'Mat', present: designChecks.hasMaterial },
                      { key: 'color_finish' as DesignApprovalKey, label: 'Color', present: designChecks.hasColor },
                      { key: 'client_selection' as DesignApprovalKey, label: 'Select', present: designChecks.hasSelection },
                    ] as const).map(check => {
                      const approval = designApprovals[check.key];
                      const isApproved = !!approval;
                      const canApproveThis = check.present && !isApproved && canApproveDesign;

                      return (
                        <div
                          key={check.key}
                          className={cn(
                            'rounded border px-2 py-1.5 text-center transition-all select-none min-h-8 flex flex-col items-center justify-center',
                            isApproved
                              ? 'border-emerald-400 bg-emerald-950/30 cursor-default'
                              : check.present
                                ? 'border-emerald-300/50 bg-emerald-950/10 cursor-pointer hover:ring-1 hover:ring-emerald-400'
                                : 'border-amber-400/50 bg-amber-950/10'
                          )}
                          onClick={() => { if (canApproveThis) handleDesignApprove(check.key); }}
                          onDoubleClick={() => { if (isApproved && canApproveDesign) handleDesignRevoke(check.key); }}
                          title={isApproved ? (canApproveDesign ? 'Double-click to revoke' : `Approved by ${approval.display_name}`) : canApproveThis ? 'Click to approve' : !canApproveDesign ? 'Insufficient permissions' : 'Data missing'}
                        >
                          <div className="flex items-center justify-center gap-1">
                            {isApproved ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            ) : check.present ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/50" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                            )}
                            <span className="text-[9px] uppercase font-medium text-muted-foreground">{check.label}</span>
                          </div>
                          {isApproved && (
                            <p className="text-[7px] text-emerald-400 truncate leading-none mt-0.5">Approved by {approval.display_name}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Design Options</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Hover a card and click the pencil to edit details. Click "Select" to flag client choice.
                    </p>
                  </div>
                  {childOptions.length < 3 && (
                    <Button size="sm" variant="outline" onClick={handleAddOption} disabled={createItem.isPending} className="h-7 text-xs">
                      <Plus className="w-3 h-3 mr-1" /> Add Option
                    </Button>
                  )}
                </div>

                {/* Option cards grid */}
                <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                  {allOptions.map((opt, i) => (
                    <OptionCard
                      key={opt.id}
                      option={opt}
                      letter={String.fromCharCode(65 + i)}
                      isSelected={!!opt.is_selected_option}
                      onSelect={() => handleSelectAnyOption(opt)}
                      parentId={opt.id === item.id ? null : item.id}
                      projectId={projectId}
                      mode="design"
                      canSeeCosts={false}
                    />
                  ))}
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
                    {renderField('Production Time', 'production_time')}
                    {renderLink('Proforma', 'proforma_url')}
                    {renderField('Production Due', 'production_due_date', { type: 'date' })}
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Status</h4>
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-sm text-muted-foreground">Lifecycle</span>
                      <Badge className={cn('text-xs', colors.bg, colors.text)}>{statusLabel}</Badge>
                    </div>
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-sm text-muted-foreground">Purchased</span>
                      <Button
                        size="sm" variant={item.purchased ? 'default' : 'outline'} className="h-7 text-xs"
                        onClick={async () => {
                          try {
                            await updateItem.mutateAsync({ id: item.id, purchased: !item.purchased });
                            queryClient.invalidateQueries({ queryKey: ['item-detail', item.id] });
                            queryClient.invalidateQueries({ queryKey: ['project-items', projectId] });
                            toast.success(item.purchased ? 'Marked as not purchased' : 'Marked as purchased');
                          } catch { toast.error('Failed to update'); }
                        }}
                        disabled={updateItem.isPending}
                      >
                        {item.purchased ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                        {item.purchased ? 'Purchased' : 'Not Purchased'}
                      </Button>
                    </div>
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-sm text-muted-foreground">Received</span>
                      <Button
                        size="sm" variant={item.received ? 'default' : 'outline'} className="h-7 text-xs"
                        onClick={async () => {
                          try {
                            const updates: any = { id: item.id, received: !item.received };
                            if (!item.received) updates.received_date = new Date().toISOString().split('T')[0];
                            await updateItem.mutateAsync(updates);
                            queryClient.invalidateQueries({ queryKey: ['item-detail', item.id] });
                            queryClient.invalidateQueries({ queryKey: ['project-items', projectId] });
                            toast.success(item.received ? 'Marked as not received' : 'Marked as received');
                          } catch { toast.error('Failed to update'); }
                        }}
                        disabled={updateItem.isPending}
                      >
                        {item.received ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                        {item.received ? 'Received' : 'Not Received'}
                      </Button>
                    </div>
                    {renderField('Received Date', 'received_date', { type: 'date' })}
                  </div>
                </div>
              </TabsContent>
            )}

            {/* ═══ QUOTATIONS TAB — budget comparison + price approval ═══ */}
            {canSeeProcurement && (
              <TabsContent value="quotations" className="space-y-5">
                {/* QS Budget Estimate + inline budget comparison */}
                {canSeeCosts && (
                  <div className="rounded-lg bg-muted/30 border border-border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">QS Budget Estimate</span>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Manual reference budget set by QS</p>
                      </div>
                      <div className="text-right">
                        {editMode ? (
                          <Input
                            type="number"
                            value={val('budget_estimate') ?? ''}
                            onChange={e => setVal('budget_estimate', e.target.value ? parseFloat(e.target.value) : null)}
                            className="w-32 h-8 text-sm font-mono text-right"
                            placeholder="0.00"
                          />
                        ) : (
                          <span className="text-lg font-bold font-mono text-foreground">
                            €{budgetEstimate.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Budget comparison inline */}
                    {budgetDiff !== null && selectedOption && (
                      <div className={cn(
                        'flex items-center gap-2 rounded-md px-3 py-2 border',
                        budgetDiff > 0
                          ? 'border-red-400/50 bg-red-950/10'
                          : 'border-emerald-400/50 bg-emerald-950/10'
                      )}>
                        {budgetDiff > 0 ? (
                          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                        ) : (
                          <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className={cn('text-xs font-semibold', budgetDiff > 0 ? 'text-red-500' : 'text-emerald-500')}>
                            {budgetDiff > 0 ? 'Over Budget' : 'Under Budget — Higher Margin'}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-2">
                            {budgetDiff > 0
                              ? `+€${budgetDiff.toFixed(2)} over estimate`
                              : `€${Math.abs(budgetDiff).toFixed(2)} saved vs estimate`}
                          </span>
                        </div>
                        <span className={cn('text-xs font-mono font-bold', budgetDiff > 0 ? 'text-red-500' : 'text-emerald-500')}>
                          €{selectedTotal.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Option cards in quotation mode */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-foreground">Option Pricing ({allOptions.length}/4)</h4>
                    {childOptions.length < 3 && (
                      <Button size="sm" variant="outline" onClick={handleAddOption} disabled={createItem.isPending} className="h-7 text-xs">
                        <Plus className="w-3 h-3 mr-1" /> Add Option
                      </Button>
                    )}
                  </div>
                  <div className={cn('grid gap-3', allOptions.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4')}>
                    {allOptions.map((opt, i) => (
                      <OptionCard
                        key={opt.id}
                        option={opt}
                        letter={String.fromCharCode(65 + i)}
                        isSelected={!!opt.is_selected_option}
                        onSelect={() => handleSelectAnyOption(opt)}
                        parentId={opt.id === item.id ? null : item.id}
                        projectId={projectId}
                        mode="quotation"
                        canSeeCosts={canSeeCosts}
                      />
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Supplier Quotations */}
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-3">Supplier Quotations</h4>
                  <QuotationsTab itemId={item.id} canEdit={canSeeProcurement} />
                </div>

                <Separator />

                {/* Item Documents */}
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-3">Item Documents</h4>
                  <ItemDocuments itemId={item.id} projectId={projectId} canEdit={canSeeProcurement} />
                </div>
              </TabsContent>
            )}

            {/* ═══ FINANCE TAB — with payment approval ═══ */}
            {(canSeePayment || canSeeCosts) && (
              <TabsContent value="finance" className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Base Cost</h4>
                    {renderField('Unit Cost', 'unit_cost', { type: 'number' })}
                    {renderField('Quantity', 'quantity', { type: 'number' })}
                    <Separator className="my-2" />
                    <h4 className="text-sm font-semibold text-foreground mb-2">Landed Costs</h4>
                    {renderField('Boxing', 'boxing_cost' as any, { type: 'number' })}
                    {renderField('Delivery', 'delivery_cost', { type: 'number' })}
                    {renderField('Shifting (port/storage/site)', 'shifting_cost' as any, { type: 'number' })}
                    {renderField('Installation', 'installation_cost', { type: 'number' })}
                    {renderField('Insurance', 'insurance_cost', { type: 'number' })}
                    <Separator className="my-2" />
                    <div className="grid grid-cols-2 gap-3">
                      <div>{renderField('Duty', 'duty_cost', { type: 'number' })}</div>
                      <div>{renderField('Custom', 'custom_cost', { type: 'number' })}</div>
                    </div>
                    <Separator className="my-2" />
                    {renderField('Extra / Safe', 'extra_safe_cost' as any, { type: 'number' })}
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

                    {/* ═══ Payment Approval Section ═══ */}
                    <Separator className="my-3" />
                    <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                      <Shield className="w-4 h-4" /> Payment Approvals
                    </h4>

                    {/* Proforma status */}
                    <div className={cn(
                      'rounded-lg border p-3 mb-3',
                      item.proforma_url ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {item.proforma_url ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-600" />
                          )}
                          <span className="text-xs font-medium">
                            {item.proforma_url ? 'Proforma Uploaded' : 'Proforma Missing — Required for payment'}
                          </span>
                        </div>
                        {item.proforma_url && (
                          <a href={item.proforma_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> View
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Payment schedule */}
                    {supplierPayments.length > 0 ? (
                      <div className="space-y-2">
                        {supplierPayments.map((p: any) => (
                          <div key={p.id} className={cn(
                            'rounded-lg border p-3 flex items-center justify-between',
                            p.is_paid ? 'border-emerald-300 bg-emerald-50/50' : 'border-border'
                          )}>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold">
                                  Payment {p.payment_number}/{p.total_payments}
                                </span>
                                <Badge variant={p.is_paid ? 'default' : 'outline'} className={cn('text-[9px] h-4', p.is_paid && 'bg-emerald-600')}>
                                  {p.is_paid ? 'Paid' : 'Pending'}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {p.supplier} • €{Number(p.amount).toFixed(2)}
                                {p.payment_date && ` • Due: ${p.payment_date}`}
                                {p.paid_date && ` • Paid: ${p.paid_date}`}
                              </p>
                            </div>
                            {!p.is_paid && canSeePayment && (
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                                onClick={async () => {
                                  try {
                                    await supabase.from('supplier_payments').update({
                                      is_paid: true,
                                      paid_date: new Date().toISOString().split('T')[0],
                                    }).eq('id', p.id);
                                    queryClient.invalidateQueries({ queryKey: ['supplier-payments', item.id] });
                                    toast.success(`Payment ${p.payment_number} marked as paid`);
                                  } catch { toast.error('Failed'); }
                                }}
                              >
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Approve Payment
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-3">
                        {item.proforma_url
                          ? 'No payment schedule created yet. Payments are managed from the supplier payments section.'
                          : 'Upload proforma first to enable payment tracking.'}
                      </p>
                    )}
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
                    <h4 className="text-sm font-semibold text-foreground mb-2">Quick Status</h4>
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-sm text-muted-foreground">Purchased</span>
                      <Button size="sm" variant={item.purchased ? 'default' : 'outline'} className="h-7 text-xs"
                        onClick={async () => {
                          try {
                            await updateItem.mutateAsync({ id: item.id, purchased: !item.purchased });
                            queryClient.invalidateQueries({ queryKey: ['item-detail', item.id] });
                            queryClient.invalidateQueries({ queryKey: ['project-items', projectId] });
                          } catch { toast.error('Failed'); }
                        }}
                        disabled={updateItem.isPending}
                      >
                        {item.purchased ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                        {item.purchased ? 'Yes' : 'No'}
                      </Button>
                    </div>
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-sm text-muted-foreground">Received</span>
                      <Button size="sm" variant={item.received ? 'default' : 'outline'} className="h-7 text-xs"
                        onClick={async () => {
                          try {
                            const updates: any = { id: item.id, received: !item.received };
                            if (!item.received) updates.received_date = new Date().toISOString().split('T')[0];
                            await updateItem.mutateAsync(updates);
                            queryClient.invalidateQueries({ queryKey: ['item-detail', item.id] });
                            queryClient.invalidateQueries({ queryKey: ['project-items', projectId] });
                          } catch { toast.error('Failed'); }
                        }}
                        disabled={updateItem.isPending}
                      >
                        {item.received ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                        {item.received ? 'Yes' : 'No'}
                      </Button>
                    </div>
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
                    {renderField('Installed Date', 'installed_date', { type: 'date' })}
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Status</h4>
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-sm text-muted-foreground">Installed</span>
                      <Button size="sm" variant={item.installed ? 'default' : 'outline'} className="h-7 text-xs"
                        onClick={async () => {
                          try {
                            const updates: any = { id: item.id, installed: !item.installed };
                            if (!item.installed) updates.installed_date = new Date().toISOString().split('T')[0];
                            await updateItem.mutateAsync(updates);
                            queryClient.invalidateQueries({ queryKey: ['item-detail', item.id] });
                            queryClient.invalidateQueries({ queryKey: ['project-items', projectId] });
                          } catch { toast.error('Failed'); }
                        }}
                        disabled={updateItem.isPending}
                      >
                        {item.installed ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                        {item.installed ? 'Installed' : 'Not Installed'}
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            )}

            {/* TASKS TAB */}
            <TabsContent value="tasks" className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">Tasks ({linkedTasks.length})</h4>
              </div>
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
                        {task.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>}
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          {task.assignee_id && (
                            <span className="flex items-center gap-1"><User className="w-2.5 h-2.5" />{getMemberName(task.assignee_id) || 'Assigned'}</span>
                          )}
                          {task.end_date && (
                            <span className="flex items-center gap-1"><CalendarIcon className="w-2.5 h-2.5" />{task.end_date}</span>
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

            {/* Lifecycle checklist is now in Info tab */}

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
