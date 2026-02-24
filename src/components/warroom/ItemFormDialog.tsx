import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Loader2, Upload } from 'lucide-react';
import { useCreateProjectItem, useUpdateProjectItem } from '@/hooks/useProjects';
import { useFloors, useRooms, useItemTypes, useSubcategories } from '@/hooks/useAdminData';
import { toast } from 'sonner';
import { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];
type BOQCategory = Database['public']['Enums']['boq_category'];
type ApprovalStatus = Database['public']['Enums']['approval_status'];
type LifecycleStatus = Database['public']['Enums']['item_lifecycle_status'];

const CATEGORIES: { value: BOQCategory; label: string }[] = [
  { value: 'joinery', label: 'Joinery' },
  { value: 'loose-furniture', label: 'Loose Furniture' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'finishes', label: 'Finishes' },
  { value: 'ffe', label: 'FF&E' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'appliances', label: 'Appliances' },
];

const APPROVAL_STATUSES: { value: ApprovalStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'revision', label: 'In Revision' },
];

const LIFECYCLE_STATUSES: { value: LifecycleStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'estimated', label: 'Estimated' },
  { value: 'approved', label: 'Approved' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'installed', label: 'Installed' },
  { value: 'on_hold', label: 'On Hold' },
];

const itemSchema = z.object({
  category: z.enum(['joinery', 'loose-furniture', 'lighting', 'finishes', 'ffe', 'accessories', 'appliances']),
  area: z.string().max(100).optional(),
  description: z.string().min(1, 'Description is required').max(500),
  approval_status: z.enum(['pending', 'approved', 'rejected', 'revision']),
  lifecycle_status: z.enum(['draft', 'estimated', 'approved', 'ordered', 'delivered', 'installed', 'on_hold']),
  floor_id: z.string().optional(),
  room_id: z.string().optional(),
  room_number: z.string().max(10).optional(),
  apartment_number: z.string().max(20).optional(),
  item_type_id: z.string().optional(),
  subcategory_id: z.string().optional(),
  dimensions: z.string().max(200).optional(),
  production_time: z.string().max(200).optional(),
  finish_material: z.string().max(200).optional(),
  finish_color: z.string().max(100).optional(),
  finish_notes: z.string().max(500).optional(),
  // Procurement
  purchased: z.boolean(),
  purchase_order_ref: z.string().max(100).optional(),
  supplier: z.string().max(200).optional(),
  unit_cost: z.string().optional(),
  quantity: z.string().optional(),
  production_due_date: z.string().optional(),
  // Costing (role-restricted visibility - future)
  delivery_cost: z.string().optional(),
  installation_cost: z.string().optional(),
  insurance_cost: z.string().optional(),
  duty_cost: z.string().optional(),
  custom_cost: z.string().optional(),
  margin_percentage: z.string().optional(),
  selling_price: z.string().optional(),
  // Delivery & Installation
  delivery_date: z.string().optional(),
  received: z.boolean(),
  received_date: z.string().optional(),
  site_movement_date: z.string().optional(),
  installation_start_date: z.string().optional(),
  installed: z.boolean(),
  installed_date: z.string().optional(),
  // Images
  reference_image_url: z.string().max(500).optional(),
  technical_drawing_url: z.string().max(500).optional(),
  company_product_url: z.string().max(500).optional(),
  // Notes
  notes: z.string().max(1000).optional(),
});

type ItemFormData = z.infer<typeof itemSchema>;

interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  item?: ProjectItem | null;
}

const DEFAULT_VALUES: ItemFormData = {
  category: 'joinery',
  area: '',
  description: '',
  approval_status: 'pending',
  lifecycle_status: 'draft',
  floor_id: '__none__',
  room_id: '__none__',
  room_number: '',
  apartment_number: '',
  item_type_id: '__none__',
  subcategory_id: '__none__',
  dimensions: '',
  production_time: '',
  finish_material: '',
  finish_color: '',
  finish_notes: '',
  purchased: false,
  purchase_order_ref: '',
  supplier: '',
  unit_cost: '',
  quantity: '1',
  production_due_date: '',
  delivery_cost: '0',
  installation_cost: '0',
  insurance_cost: '0',
  duty_cost: '0',
  custom_cost: '0',
  margin_percentage: '0',
  selling_price: '',
  delivery_date: '',
  received: false,
  received_date: '',
  site_movement_date: '',
  installation_start_date: '',
  installed: false,
  installed_date: '',
  reference_image_url: '',
  technical_drawing_url: '',
  company_product_url: '',
  notes: '',
};

export function ItemFormDialog({ open, onOpenChange, projectId, item }: ItemFormDialogProps) {
  const { user } = useAuth();
  const createItem = useCreateProjectItem();
  const updateItem = useUpdateProjectItem();
  const isEditing = !!item;

  const { data: floors = [] } = useFloors();
  const { data: rooms = [] } = useRooms();
  const { data: itemTypes = [] } = useItemTypes();
  const { data: allSubcategories = [] } = useSubcategories();

  const [uploadingField, setUploadingField] = useState<string | null>(null);

  const form = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const selectedCategory = form.watch('category');
  const selectedItemTypeId = form.watch('item_type_id');

  // Filter item types by selected category (coherence)
  const filteredItemTypes = useMemo(() => {
    return itemTypes.filter((t: any) => {
      if (!t.allowed_categories || t.allowed_categories.length === 0) return true;
      return t.allowed_categories.includes(selectedCategory);
    });
  }, [itemTypes, selectedCategory]);

  // Filter subcategories by selected item type
  const filteredSubcategories = useMemo(() => {
    if (!selectedItemTypeId || selectedItemTypeId === '__none__') return [];
    return allSubcategories.filter((s: any) => s.item_type_id === selectedItemTypeId);
  }, [allSubcategories, selectedItemTypeId]);

  // When category changes, reset item_type if not compatible
  useEffect(() => {
    const currentType = form.getValues('item_type_id');
    if (currentType && currentType !== '__none__') {
      const typeData = itemTypes.find((t: any) => t.id === currentType) as any;
      if (typeData?.allowed_categories?.length > 0 && !typeData.allowed_categories.includes(selectedCategory)) {
        form.setValue('item_type_id', '__none__');
        form.setValue('subcategory_id', '__none__');
      }
    }
  }, [selectedCategory, itemTypes, form]);

  useEffect(() => {
    if (item) {
      form.reset({
        category: item.category,
        area: item.area || '',
        description: item.description,
        approval_status: item.approval_status,
        lifecycle_status: item.lifecycle_status || 'draft',
        floor_id: item.floor_id || '__none__',
        room_id: item.room_id || '__none__',
        room_number: (item as any).room_number || '',
        apartment_number: item.apartment_number || '',
        item_type_id: item.item_type_id || '__none__',
        subcategory_id: item.subcategory_id || '__none__',
        dimensions: item.dimensions || '',
        production_time: (item as any).production_time || '',
        finish_material: item.finish_material || '',
        finish_color: item.finish_color || '',
        finish_notes: item.finish_notes || '',
        purchased: item.purchased,
        purchase_order_ref: item.purchase_order_ref || '',
        supplier: item.supplier || '',
        unit_cost: item.unit_cost?.toString() || '',
        quantity: item.quantity?.toString() || '1',
        production_due_date: item.production_due_date || '',
        delivery_cost: ((item as any).delivery_cost || 0).toString(),
        installation_cost: ((item as any).installation_cost || 0).toString(),
        insurance_cost: ((item as any).insurance_cost || 0).toString(),
        duty_cost: ((item as any).duty_cost || 0).toString(),
        custom_cost: ((item as any).custom_cost || 0).toString(),
        margin_percentage: item.margin_percentage?.toString() || '0',
        selling_price: item.selling_price?.toString() || '',
        delivery_date: item.delivery_date || '',
        received: item.received,
        received_date: item.received_date || '',
        site_movement_date: (item as any).site_movement_date || '',
        installation_start_date: (item as any).installation_start_date || '',
        installed: item.installed,
        installed_date: item.installed_date || '',
        reference_image_url: (item as any).reference_image_url || '',
        technical_drawing_url: (item as any).technical_drawing_url || '',
        company_product_url: (item as any).company_product_url || '',
        notes: item.notes || '',
      });
    } else {
      form.reset(DEFAULT_VALUES);
    }
  }, [item, form]);

  const handleFileUpload = async (field: 'reference_image_url' | 'technical_drawing_url' | 'company_product_url', file: File) => {
    if (!user) return;
    setUploadingField(field);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/${projectId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('item-files').upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('item-files').getPublicUrl(path);
      form.setValue(field, urlData.publicUrl);
      toast.success('File uploaded');
    } catch (e: any) {
      toast.error('Upload failed: ' + (e.message || 'Unknown error'));
    } finally {
      setUploadingField(null);
    }
  };

  const onSubmit = async (data: ItemFormData) => {
    try {
      const none = (v: string | undefined) => v && v !== '__none__' ? v : null;
      const num = (v: string | undefined) => v ? parseFloat(v) : null;
      const numDef = (v: string | undefined, def: number) => v ? parseFloat(v) : def;

      const payload: any = {
        project_id: projectId,
        category: data.category,
        area: data.area || 'N/A',
        description: data.description,
        approval_status: data.approval_status,
        lifecycle_status: data.lifecycle_status,
        floor_id: none(data.floor_id),
        room_id: none(data.room_id),
        room_number: data.room_number || null,
        apartment_number: data.apartment_number || null,
        item_type_id: none(data.item_type_id),
        subcategory_id: none(data.subcategory_id),
        dimensions: data.dimensions || null,
        production_time: data.production_time || null,
        finish_material: data.finish_material || null,
        finish_color: data.finish_color || null,
        finish_notes: data.finish_notes || null,
        purchased: data.purchased,
        purchase_order_ref: data.purchase_order_ref || null,
        supplier: data.supplier || null,
        unit_cost: num(data.unit_cost),
        quantity: data.quantity ? parseInt(data.quantity) : 1,
        production_due_date: data.production_due_date || null,
        delivery_cost: numDef(data.delivery_cost, 0),
        installation_cost: numDef(data.installation_cost, 0),
        insurance_cost: numDef(data.insurance_cost, 0),
        duty_cost: numDef(data.duty_cost, 0),
        custom_cost: numDef(data.custom_cost, 0),
        margin_percentage: numDef(data.margin_percentage, 0),
        selling_price: num(data.selling_price),
        delivery_date: data.delivery_date || null,
        received: data.received,
        received_date: data.received_date || null,
        site_movement_date: data.site_movement_date || null,
        installation_start_date: data.installation_start_date || null,
        installed: data.installed,
        installed_date: data.installed_date || null,
        reference_image_url: data.reference_image_url || null,
        technical_drawing_url: data.technical_drawing_url || null,
        company_product_url: data.company_product_url || null,
        notes: data.notes || null,
        boq_included: true,
      };

      if (isEditing && item) {
        await updateItem.mutateAsync({ id: item.id, ...payload });
        toast.success('Item updated successfully');
      } else {
        await createItem.mutateAsync(payload);
        toast.success('Item created successfully');
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(isEditing ? 'Failed to update item' : 'Failed to create item');
    }
  };

  const isSubmitting = createItem.isPending || updateItem.isPending;

  const floorOptions = floors.map(f => ({ value: f.id, label: `${f.code} – ${f.name}` }));
  const roomOptions = rooms.map(r => ({ value: r.id, label: `${r.code} – ${r.name}` }));
  const itemTypeOptions = filteredItemTypes.map((t: any) => ({ value: t.id, label: `${t.code} – ${t.name}` }));
  const subcategoryOptions = filteredSubcategories.map((s: any) => ({ value: s.id, label: `${s.code} – ${s.name}` }));

  const FileUploadField = ({ name, label }: { name: 'reference_image_url' | 'technical_drawing_url' | 'company_product_url'; label: string }) => (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <div className="flex gap-2">
          <FormControl><Input placeholder="https://..." {...field} className="flex-1" /></FormControl>
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(name, file);
            }} />
            <Button type="button" variant="outline" size="icon" className="shrink-0" disabled={uploadingField === name} asChild>
              <span>{uploadingField === name ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}</span>
            </Button>
          </label>
        </div>
      </FormItem>
    )} />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Item' : 'New Item'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update item details and workflow status' : 'Add a new item to the BOQ'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Item Code (read-only) */}
            {isEditing && item?.item_code && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
                <span className="text-sm text-muted-foreground">Item Code:</span>
                <span className="font-mono font-bold text-primary text-lg">{item.item_code}</span>
                <span className="text-xs text-muted-foreground ml-auto">Auto-generated</span>
              </div>
            )}
            {!isEditing && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/30">
                <span className="text-sm text-muted-foreground">Item Code:</span>
                <span className="text-sm text-muted-foreground italic">Will be auto-generated</span>
              </div>
            )}

            {/* ── Location & Hierarchy ── */}
            <div className="space-y-4 p-4 rounded-lg border border-border bg-secondary/30">
              <h4 className="text-sm font-semibold text-foreground">Location & Hierarchy</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="floor_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Floor *</FormLabel>
                    <SearchableSelect
                      options={floorOptions}
                      value={field.value || '__none__'}
                      onValueChange={field.onChange}
                      placeholder="Select floor"
                      searchPlaceholder="Search floors..."
                    />
                  </FormItem>
                )} />
                <FormField control={form.control} name="room_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Room Type *</FormLabel>
                    <SearchableSelect
                      options={roomOptions}
                      value={field.value || '__none__'}
                      onValueChange={field.onChange}
                      placeholder="Select room"
                      searchPlaceholder="Search rooms..."
                    />
                  </FormItem>
                )} />
                <FormField control={form.control} name="apartment_number" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apartment #</FormLabel>
                    <FormControl><Input placeholder="01" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="room_number" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Room #</FormLabel>
                    <FormControl><Input placeholder="01" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
            </div>

            {/* ── Item Classification ── */}
            <div className="space-y-4 p-4 rounded-lg border border-border bg-secondary/30">
              <h4 className="text-sm font-semibold text-foreground">Item Classification</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {CATEGORIES.map(cat => <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="item_type_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Type</FormLabel>
                    <SearchableSelect
                      options={itemTypeOptions}
                      value={field.value || '__none__'}
                      onValueChange={(v) => { field.onChange(v); form.setValue('subcategory_id', '__none__'); }}
                      placeholder="Select type"
                      searchPlaceholder="Search types..."
                    />
                  </FormItem>
                )} />
                <FormField control={form.control} name="subcategory_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subcategory</FormLabel>
                    <SearchableSelect
                      options={subcategoryOptions}
                      value={field.value || '__none__'}
                      onValueChange={field.onChange}
                      placeholder={selectedItemTypeId && selectedItemTypeId !== '__none__' ? 'Select' : 'Choose type first'}
                      searchPlaceholder="Search subcategories..."
                      disabled={!selectedItemTypeId || selectedItemTypeId === '__none__'}
                    />
                  </FormItem>
                )} />
                <FormField control={form.control} name="lifecycle_status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lifecycle</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {LIFECYCLE_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description *</FormLabel>
                  <FormControl><Input placeholder="Sofa 3-seater - Italian leather" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="dimensions" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dimensions</FormLabel>
                    <FormControl><Input placeholder="W120 x D60 x H80 cm" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="production_time" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Production Time</FormLabel>
                    <FormControl><Input placeholder="6-8 weeks" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
            </div>

            {/* ── Finishes ── */}
            <div className="space-y-4 p-4 rounded-lg border border-border bg-secondary/30">
              <h4 className="text-sm font-semibold text-foreground">Finishes</h4>
              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="finish_material" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Material</FormLabel>
                    <FormControl><Input placeholder="Oak veneer" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="finish_color" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl><Input placeholder="RAL 9010" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="finish_notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Finish Notes</FormLabel>
                    <FormControl><Input placeholder="Matt lacquer" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
            </div>

            {/* ── Approval ── */}
            <FormField control={form.control} name="approval_status" render={({ field }) => (
              <FormItem className="p-4 rounded-lg border border-border bg-secondary/30">
                <FormLabel>Approval Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {APPROVAL_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormItem>
            )} />

            {/* ── Images & Links ── */}
            <div className="space-y-4 p-4 rounded-lg border border-border bg-secondary/30">
              <h4 className="text-sm font-semibold text-foreground">Images & Links</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FileUploadField name="reference_image_url" label="Reference Image" />
                <FileUploadField name="technical_drawing_url" label="Technical Drawing" />
                <FileUploadField name="company_product_url" label="Company Product Link" />
              </div>
            </div>

            {/* ── Procurement ── */}
            <div className="space-y-4 p-4 rounded-lg border border-border bg-secondary/30">
              <h4 className="text-sm font-semibold text-foreground">Procurement</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="supplier" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier Name</FormLabel>
                    <FormControl><Input placeholder="Supplier name" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="unit_cost" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Cost</FormLabel>
                    <FormControl><Input type="number" placeholder="0.00" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="quantity" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl><Input type="number" placeholder="1" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="purchase_order_ref" render={({ field }) => (
                  <FormItem>
                    <FormLabel>PO Reference</FormLabel>
                    <FormControl><Input placeholder="PO-001" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="flex items-center gap-4">
                <FormField control={form.control} name="purchased" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <FormLabel className="font-normal">Purchased</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="production_due_date" render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Production Due</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
            </div>

            {/* ── Costing (Selling Price Build-up) ── */}
            <div className="space-y-4 p-4 rounded-lg border border-border bg-secondary/30">
              <h4 className="text-sm font-semibold text-foreground">Costing & Selling Price</h4>
              <p className="text-xs text-muted-foreground">Values can be entered as fixed amounts. Margin is in %.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <FormField control={form.control} name="delivery_cost" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delivery Cost</FormLabel>
                    <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="installation_cost" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Installation Cost</FormLabel>
                    <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="insurance_cost" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Insurance</FormLabel>
                    <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="duty_cost" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duty</FormLabel>
                    <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="custom_cost" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custom</FormLabel>
                    <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="margin_percentage" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Margin %</FormLabel>
                    <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="selling_price" render={({ field }) => (
                <FormItem>
                  <FormLabel>Selling Price (Final)</FormLabel>
                  <FormControl><Input type="number" placeholder="Calculated or manual" {...field} /></FormControl>
                </FormItem>
              )} />
            </div>

            {/* ── Delivery & Installation ── */}
            <div className="space-y-4 p-4 rounded-lg border border-border bg-secondary/30">
              <h4 className="text-sm font-semibold text-foreground">Delivery & Installation</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="delivery_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delivery Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="received_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reception Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="site_movement_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site Movement Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="installation_start_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Installation Start</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="flex items-center gap-6">
                <FormField control={form.control} name="received" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <FormLabel className="font-normal">Received</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="installed" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <FormLabel className="font-normal">Installed</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="installed_date" render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Installed Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
            </div>

            {/* ── Notes ── */}
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Input placeholder="Additional notes..." {...field} /></FormControl>
              </FormItem>
            )} />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {isEditing ? 'Update Item' : 'Create Item'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
