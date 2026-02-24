import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { useCreateProjectItem, useUpdateProjectItem } from '@/hooks/useProjects';
import { useFloors, useRooms, useItemTypes, useSubcategories } from '@/hooks/useAdminData';
import { toast } from 'sonner';
import { Database } from '@/integrations/supabase/types';

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
  area: z.string().min(1, 'Area is required').max(100),
  description: z.string().min(1, 'Description is required').max(500),
  boq_included: z.boolean(),
  approval_status: z.enum(['pending', 'approved', 'rejected', 'revision']),
  lifecycle_status: z.enum(['draft', 'estimated', 'approved', 'ordered', 'delivered', 'installed', 'on_hold']),
  floor_id: z.string().optional(),
  room_id: z.string().optional(),
  apartment_number: z.string().max(20).optional(),
  item_type_id: z.string().optional(),
  subcategory_id: z.string().optional(),
  dimensions: z.string().max(200).optional(),
  finish_material: z.string().max(200).optional(),
  finish_color: z.string().max(100).optional(),
  finish_notes: z.string().max(500).optional(),
  purchased: z.boolean(),
  purchase_order_ref: z.string().max(100).optional(),
  production_due_date: z.string().optional(),
  delivery_date: z.string().optional(),
  received: z.boolean(),
  received_date: z.string().optional(),
  installed: z.boolean(),
  installed_date: z.string().optional(),
  supplier: z.string().max(200).optional(),
  unit_cost: z.string().optional(),
  quantity: z.string().optional(),
  selling_price: z.string().optional(),
  margin_percentage: z.string().optional(),
  notes: z.string().max(1000).optional(),
  image_3d_ref: z.string().max(500).optional(),
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
  boq_included: false,
  approval_status: 'pending',
  lifecycle_status: 'draft',
  floor_id: '__none__',
  room_id: '__none__',
  apartment_number: '',
  item_type_id: '__none__',
  subcategory_id: '__none__',
  dimensions: '',
  finish_material: '',
  finish_color: '',
  finish_notes: '',
  purchased: false,
  purchase_order_ref: '',
  production_due_date: '',
  delivery_date: '',
  received: false,
  received_date: '',
  installed: false,
  installed_date: '',
  supplier: '',
  unit_cost: '',
  quantity: '1',
  selling_price: '',
  margin_percentage: '0',
  notes: '',
  image_3d_ref: '',
};

export function ItemFormDialog({ open, onOpenChange, projectId, item }: ItemFormDialogProps) {
  const createItem = useCreateProjectItem();
  const updateItem = useUpdateProjectItem();
  const isEditing = !!item;

  // Master data
  const { data: floors = [] } = useFloors();
  const { data: rooms = [] } = useRooms();
  const { data: itemTypes = [] } = useItemTypes();
  const { data: allSubcategories = [] } = useSubcategories();

  const form = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const selectedItemTypeId = form.watch('item_type_id');

  // Filter subcategories by selected item type
  const filteredSubcategories = useMemo(() => {
    if (!selectedItemTypeId || selectedItemTypeId === '__none__') return [];
    return allSubcategories.filter((s: any) => s.item_type_id === selectedItemTypeId);
  }, [allSubcategories, selectedItemTypeId]);

  useEffect(() => {
    if (item) {
      form.reset({
        category: item.category,
        area: item.area,
        description: item.description,
        boq_included: item.boq_included,
        approval_status: item.approval_status,
        lifecycle_status: item.lifecycle_status || 'draft',
        floor_id: item.floor_id || '__none__',
        room_id: item.room_id || '__none__',
        apartment_number: item.apartment_number || '',
        item_type_id: item.item_type_id || '__none__',
        subcategory_id: item.subcategory_id || '__none__',
        dimensions: item.dimensions || '',
        finish_material: item.finish_material || '',
        finish_color: item.finish_color || '',
        finish_notes: item.finish_notes || '',
        purchased: item.purchased,
        purchase_order_ref: item.purchase_order_ref || '',
        production_due_date: item.production_due_date || '',
        delivery_date: item.delivery_date || '',
        received: item.received,
        received_date: item.received_date || '',
        installed: item.installed,
        installed_date: item.installed_date || '',
        supplier: item.supplier || '',
        unit_cost: item.unit_cost?.toString() || '',
        quantity: item.quantity?.toString() || '1',
        selling_price: item.selling_price?.toString() || '',
        margin_percentage: item.margin_percentage?.toString() || '0',
        notes: item.notes || '',
        image_3d_ref: item.image_3d_ref || '',
      });
    } else {
      form.reset(DEFAULT_VALUES);
    }
  }, [item, form]);

  const onSubmit = async (data: ItemFormData) => {
    try {
      const payload = {
        project_id: projectId,
        category: data.category,
        area: data.area,
        description: data.description,
        boq_included: data.boq_included,
        approval_status: data.approval_status,
        lifecycle_status: data.lifecycle_status,
        floor_id: data.floor_id && data.floor_id !== '__none__' ? data.floor_id : null,
        room_id: data.room_id && data.room_id !== '__none__' ? data.room_id : null,
        apartment_number: data.apartment_number || null,
        item_type_id: data.item_type_id && data.item_type_id !== '__none__' ? data.item_type_id : null,
        subcategory_id: data.subcategory_id && data.subcategory_id !== '__none__' ? data.subcategory_id : null,
        dimensions: data.dimensions || null,
        finish_material: data.finish_material || null,
        finish_color: data.finish_color || null,
        finish_notes: data.finish_notes || null,
        purchased: data.purchased,
        purchase_order_ref: data.purchase_order_ref || null,
        production_due_date: data.production_due_date || null,
        delivery_date: data.delivery_date || null,
        received: data.received,
        received_date: data.received_date || null,
        installed: data.installed,
        installed_date: data.installed_date || null,
        supplier: data.supplier || null,
        unit_cost: data.unit_cost ? parseFloat(data.unit_cost) : null,
        quantity: data.quantity ? parseInt(data.quantity) : 1,
        selling_price: data.selling_price ? parseFloat(data.selling_price) : null,
        margin_percentage: data.margin_percentage ? parseFloat(data.margin_percentage) : 0,
        notes: data.notes || null,
        image_3d_ref: data.image_3d_ref || null,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Item' : 'New Item'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update item details and workflow status' : 'Add a new item to track'}
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
                    <FormLabel>Floor</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select floor" /></SelectTrigger></FormControl>
                      <SelectContent>
                         <SelectItem value="__none__">None</SelectItem>
                        {floors.map(f => <SelectItem key={f.id} value={f.id}>{f.code} – {f.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="room_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Room</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger></FormControl>
                      <SelectContent>
                         <SelectItem value="__none__">None</SelectItem>
                        {rooms.map(r => <SelectItem key={r.id} value={r.id}>{r.code} – {r.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="apartment_number" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apartment #</FormLabel>
                    <FormControl><Input placeholder="01" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="area" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Area *</FormLabel>
                    <FormControl><Input placeholder="Living Room" {...field} /></FormControl>
                    <FormMessage />
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
                    <Select onValueChange={(v) => { field.onChange(v); form.setValue('subcategory_id', ''); }} value={field.value || ''}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                      <SelectContent>
                         <SelectItem value="__none__">None</SelectItem>
                        {itemTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.code} – {t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="subcategory_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subcategory</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''} disabled={!selectedItemTypeId}>
                      <FormControl><SelectTrigger><SelectValue placeholder={selectedItemTypeId ? 'Select' : 'Choose type first'} /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {filteredSubcategories.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.code} – {s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
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
                <FormField control={form.control} name="image_3d_ref" render={({ field }) => (
                  <FormItem>
                    <FormLabel>3D Image Ref URL</FormLabel>
                    <FormControl><Input placeholder="https://..." {...field} /></FormControl>
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

            {/* ── BOQ & Approval ── */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="boq_included" render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border border-border p-4">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <FormLabel className="font-normal">BOQ Included</FormLabel>
                </FormItem>
              )} />
              <FormField control={form.control} name="approval_status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Approval Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {APPROVAL_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>

            {/* ── Procurement ── */}
            <div className="space-y-4 p-4 rounded-lg border border-border bg-secondary/30">
              <h4 className="text-sm font-semibold text-foreground">Procurement</h4>
              <div className="grid grid-cols-3 gap-4">
                <FormField control={form.control} name="purchased" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <FormLabel className="font-normal">Purchased</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="supplier" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier</FormLabel>
                    <FormControl><Input placeholder="Supplier name" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="purchase_order_ref" render={({ field }) => (
                  <FormItem>
                    <FormLabel>PO Reference</FormLabel>
                    <FormControl><Input placeholder="PO-001" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
                <FormField control={form.control} name="selling_price" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selling Price</FormLabel>
                    <FormControl><Input type="number" placeholder="0.00" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="margin_percentage" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Margin %</FormLabel>
                    <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="production_due_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Production Due</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
            </div>

            {/* ── Delivery & Installation ── */}
            <div className="space-y-4 p-4 rounded-lg border border-border bg-secondary/30">
              <h4 className="text-sm font-semibold text-foreground">Delivery & Installation</h4>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="delivery_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delivery Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                  </FormItem>
                )} />
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
                </div>
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
