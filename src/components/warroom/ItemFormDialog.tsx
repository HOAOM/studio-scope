import { useEffect } from 'react';
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
import { toast } from 'sonner';
import { Database } from '@/integrations/supabase/types';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];
type BOQCategory = Database['public']['Enums']['boq_category'];
type ApprovalStatus = Database['public']['Enums']['approval_status'];

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

const itemSchema = z.object({
  category: z.enum(['joinery', 'loose-furniture', 'lighting', 'finishes', 'ffe', 'accessories', 'appliances']),
  area: z.string().min(1, 'Area is required').max(100),
  description: z.string().min(1, 'Description is required').max(500),
  boq_included: z.boolean(),
  approval_status: z.enum(['pending', 'approved', 'rejected', 'revision']),
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

export function ItemFormDialog({ open, onOpenChange, projectId, item }: ItemFormDialogProps) {
  const createItem = useCreateProjectItem();
  const updateItem = useUpdateProjectItem();
  const isEditing = !!item;

  const form = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      category: 'joinery',
      area: '',
      description: '',
      boq_included: false,
      approval_status: 'pending',
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
      notes: '',
      image_3d_ref: '',
    },
  });

  useEffect(() => {
    if (item) {
      form.reset({
        category: item.category,
        area: item.area,
        description: item.description,
        boq_included: item.boq_included,
        approval_status: item.approval_status,
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
        notes: item.notes || '',
        image_3d_ref: item.image_3d_ref || '',
      });
    } else {
      form.reset({
        category: 'joinery',
        area: '',
        description: '',
        boq_included: false,
        approval_status: 'pending',
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
        notes: '',
        image_3d_ref: '',
      });
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
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Item' : 'New Item'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update item details and workflow status' : 'Add a new item to track'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map(cat => (
                          <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="area"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Area</FormLabel>
                    <FormControl>
                      <Input placeholder="Living Room" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="Sofa 3-seater - Italian leather" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* BOQ & Approval */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="boq_included"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border border-border p-4">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="font-normal">BOQ Included</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="approval_status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Approval Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {APPROVAL_STATUSES.map(status => (
                          <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Procurement */}
            <div className="space-y-4 p-4 rounded-lg border border-border bg-secondary/30">
              <h4 className="text-sm font-semibold text-foreground">Procurement</h4>
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="purchased"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="font-normal">Purchased</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="supplier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier</FormLabel>
                      <FormControl>
                        <Input placeholder="Supplier name" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="purchase_order_ref"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PO Reference</FormLabel>
                      <FormControl>
                        <Input placeholder="PO-001" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="unit_cost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Cost</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="0.00" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="1" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="production_due_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Production Due</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Delivery & Installation */}
            <div className="space-y-4 p-4 rounded-lg border border-border bg-secondary/30">
              <h4 className="text-sm font-semibold text-foreground">Delivery & Installation</h4>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="delivery_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="flex items-center gap-6">
                  <FormField
                    control={form.control}
                    name="received"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="font-normal">Received</FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="installed"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="font-normal">Installed</FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Notes & 3D Reference */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Input placeholder="Additional notes..." {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="image_3d_ref"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>3D Image Reference URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

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
