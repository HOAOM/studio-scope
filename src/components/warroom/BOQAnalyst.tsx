import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Copy,
  RotateCcw,
  Search,
  Edit,
  Trash2,
  ArrowUpDown,
  Eye,
  EyeOff,
  ImageIcon,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Database } from '@/integrations/supabase/types';
import { useCreateProjectItem, useUpdateProjectItem, useDeleteProjectItem } from '@/hooks/useProjects';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ProjectItem = Database['public']['Tables']['project_items']['Row'];
type BOQCategory = Database['public']['Enums']['boq_category'];

// ---- Color palette for room-based row coloring ----
const COLOR_PALETTE = [
  'hsl(0 70% 95%)', 'hsl(210 70% 95%)', 'hsl(30 70% 95%)', 'hsl(120 70% 95%)',
  'hsl(300 70% 95%)', 'hsl(180 70% 95%)', 'hsl(60 70% 95%)', 'hsl(270 50% 95%)',
  'hsl(150 50% 95%)', 'hsl(330 50% 95%)', 'hsl(240 50% 95%)', 'hsl(15 70% 95%)',
];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getRoomColor(floorCode: string, roomCode: string, roomNum: string): string {
  const key = `${floorCode}${roomCode}${roomNum}`;
  return COLOR_PALETTE[hashCode(key) % COLOR_PALETTE.length];
}

// ---- Item type to BOQ category mapping ----
function itemTypeToCategory(typeCode: string): BOQCategory {
  const map: Record<string, BOQCategory> = {
    'LF': 'loose-furniture',
    'CF': 'joinery',
    'LG': 'lighting',
    'FL': 'finishes',
    'DR': 'joinery',
    'CL': 'finishes',
    'CT': 'ffe',
    'FX': 'accessories',
  };
  return map[typeCode] || 'ffe';
}

// ---- Column visibility type ----
type ColumnKey = 'image' | 'zone' | 'area' | 'brand' | 'finishing' | 'size' | 'tech' | 'refImg' | 'coLink' | 'unitRate' | 'amount' | 'prodTime' | 'notes';

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'image', label: 'Image' },
  { key: 'zone', label: 'Zone' },
  { key: 'area', label: 'Area' },
  { key: 'brand', label: 'Brand' },
  { key: 'finishing', label: 'Finishing' },
  { key: 'size', label: 'Size' },
  { key: 'tech', label: 'Tech Drawings' },
  { key: 'refImg', label: 'Ref Image' },
  { key: 'coLink', label: 'Co.Link' },
  { key: 'unitRate', label: 'Unit Rate' },
  { key: 'amount', label: 'Amount' },
  { key: 'prodTime', label: 'Prod.Time' },
  { key: 'notes', label: 'Notes' },
];

interface BOQAnalystProps {
  projectId: string;
  items: ProjectItem[];
  canSeeCosts: boolean;
}

interface FormData {
  floorId: string;
  roomId: string;
  roomNumber: string;
  itemTypeId: string;
  subcategoryId: string;
  sequence: string;
  zone: string;
  area: string;
  brand: string;
  finishing: string;
  size: string;
  productionTime: string;
  description: string;
  refImage: string;
  techDrawings: string;
  companyLink: string;
  qty: string;
  unit: string;
  unitRate: string;
  notes: string;
}

const EMPTY_FORM: FormData = {
  floorId: '', roomId: '', roomNumber: '01', itemTypeId: '', subcategoryId: '',
  sequence: '', zone: '', area: '', brand: '', finishing: '', size: '',
  productionTime: '', description: '', refImage: '', techDrawings: '',
  companyLink: '', qty: '1', unit: 'pcs', unitRate: '', notes: '',
};

type SortField = 'code' | 'floor' | 'room' | 'zone' | 'area' | 'brand' | 'qty' | 'unitRate' | 'amount';

export function BOQAnalyst({ projectId, items, canSeeCosts }: BOQAnalystProps) {
  const [form, setForm] = useState<FormData>({ ...EMPTY_FORM });
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(new Set(ALL_COLUMNS.map(c => c.key)));
  const [showColumnToggle, setShowColumnToggle] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<ProjectItem | null>(null);

  const createItem = useCreateProjectItem();
  const updateItem = useUpdateProjectItem();
  const deleteItem = useDeleteProjectItem();

  // Fetch master data
  const { data: floors = [] } = useQuery({
    queryKey: ['master_floors'],
    queryFn: async () => {
      const { data } = await supabase.from('master_floors').select('*').order('sort_order');
      return data || [];
    },
  });
  const { data: rooms = [] } = useQuery({
    queryKey: ['master_rooms'],
    queryFn: async () => {
      const { data } = await supabase.from('master_rooms').select('*').order('sort_order');
      return data || [];
    },
  });
  const { data: itemTypes = [] } = useQuery({
    queryKey: ['master_item_types'],
    queryFn: async () => {
      const { data } = await supabase.from('master_item_types').select('*').order('sort_order');
      return data || [];
    },
  });
  const { data: subcategories = [] } = useQuery({
    queryKey: ['master_subcategories'],
    queryFn: async () => {
      const { data } = await supabase.from('master_subcategories').select('*').order('sort_order');
      return data || [];
    },
  });

  // Derived options
  const floorOptions = useMemo(() => floors.map(f => ({ value: f.id, label: `${f.code} - ${f.name}` })), [floors]);
  const roomOptions = useMemo(() => rooms.map(r => ({ value: r.id, label: `${r.code} - ${r.name}` })), [rooms]);
  const itemTypeOptions = useMemo(() => itemTypes.map(t => ({ value: t.id, label: `${t.code} - ${t.name}` })), [itemTypes]);

  const filteredSubcategories = useMemo(() => {
    if (!form.itemTypeId) return [];
    return subcategories
      .filter(s => s.item_type_id === form.itemTypeId)
      .map(s => ({ value: s.id, label: `${s.code} - ${s.name}` }));
  }, [subcategories, form.itemTypeId]);

  // Code preview
  const codePreview = useMemo(() => {
    const floor = floors.find(f => f.id === form.floorId);
    const room = rooms.find(r => r.id === form.roomId);
    const type = itemTypes.find(t => t.id === form.itemTypeId);
    const sub = subcategories.find(s => s.id === form.subcategoryId);
    const roomNum = (form.roomNumber || '01').padStart(2, '0');
    const seq = (form.sequence || '001').padStart(3, '0');

    if (!floor || !room || !type || !sub) return null;
    return `${floor.code}${room.code}${roomNum}-${type.code}${sub.code}${seq}`;
  }, [form, floors, rooms, itemTypes, subcategories]);

  // Stats
  const stats = useMemo(() => {
    const totalAmount = items.reduce((s, i) => s + (i.unit_cost || 0) * (i.quantity || 1), 0);
    const missingPrices = items.filter(i => !i.unit_cost || i.unit_cost === 0).length;
    const uniqueFloors = new Set(items.map(i => i.floor_id).filter(Boolean)).size;
    return { totalItems: items.length, totalAmount, missingPrices, uniqueFloors };
  }, [items]);

  // Filtered + sorted items
  const displayItems = useMemo(() => {
    let result = items.filter(item => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        (item.item_code || '').toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.area.toLowerCase().includes(q) ||
        (item.supplier || '').toLowerCase().includes(q) ||
        (item.notes || '').toLowerCase().includes(q)
      );
    });

    if (sortField) {
      result = [...result].sort((a, b) => {
        let va: string | number = '', vb: string | number = '';
        switch (sortField) {
          case 'code': va = a.item_code || ''; vb = b.item_code || ''; break;
          case 'floor': va = a.floor_id || ''; vb = b.floor_id || ''; break;
          case 'room': va = a.room_id || ''; vb = b.room_id || ''; break;
          case 'zone': va = a.area; vb = b.area; break;
          case 'area': va = a.area; vb = b.area; break;
          case 'brand': va = a.supplier || ''; vb = b.supplier || ''; break;
          case 'qty': va = a.quantity || 0; vb = b.quantity || 0; break;
          case 'unitRate': va = a.unit_cost || 0; vb = b.unit_cost || 0; break;
          case 'amount': va = (a.unit_cost || 0) * (a.quantity || 1); vb = (b.unit_cost || 0) * (b.quantity || 1); break;
        }
        if (typeof va === 'number' && typeof vb === 'number') return sortAsc ? va - vb : vb - va;
        return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      });
    }

    return result;
  }, [items, searchQuery, sortField, sortAsc]);

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  }, [sortField, sortAsc]);

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const isCol = (key: ColumnKey) => visibleColumns.has(key);

  const updateField = (field: keyof FormData, value: string) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      // Reset subcategory when item type changes
      if (field === 'itemTypeId') next.subcategoryId = '';
      return next;
    });
  };

  const clearForm = (keepRoom = false) => {
    if (keepRoom) {
      setForm(prev => ({
        ...EMPTY_FORM,
        floorId: prev.floorId,
        roomId: prev.roomId,
        roomNumber: prev.roomNumber,
        qty: prev.qty,
      }));
    } else {
      setForm({ ...EMPTY_FORM });
    }
    setEditingItemId(null);
  };

  const handleSubmit = async () => {
    if (!form.floorId || !form.roomId || !form.itemTypeId || !form.subcategoryId) {
      toast.error('Please fill Floor, Room, Item Type and Subcategory');
      return;
    }

    const type = itemTypes.find(t => t.id === form.itemTypeId);
    const category = type ? itemTypeToCategory(type.code) : 'ffe';

    const payload: any = {
      project_id: projectId,
      floor_id: form.floorId,
      room_id: form.roomId,
      room_number: form.roomNumber || '01',
      item_type_id: form.itemTypeId,
      subcategory_id: form.subcategoryId,
      sequence_number: parseInt(form.sequence) || undefined,
      area: form.zone || form.area || 'General',
      description: form.description || 'Item',
      supplier: form.brand || undefined,
      finish_material: form.finishing || undefined,
      dimensions: form.size || undefined,
      production_time: form.productionTime || undefined,
      reference_image_url: form.refImage || undefined,
      technical_drawing_url: form.techDrawings || undefined,
      company_product_url: form.companyLink || undefined,
      quantity: parseFloat(form.qty) || 1,
      unit_cost: parseFloat(form.unitRate) || undefined,
      notes: form.notes || undefined,
      category,
    };

    try {
      if (editingItemId) {
        await updateItem.mutateAsync({ id: editingItemId, ...payload });
        toast.success('Item updated');
      } else {
        await createItem.mutateAsync(payload);
        toast.success('Item added');
      }
      clearForm(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save item');
    }
  };

  const handleEdit = (item: ProjectItem) => {
    setEditingItemId(item.id);
    setForm({
      floorId: item.floor_id || '',
      roomId: item.room_id || '',
      roomNumber: item.room_number || '01',
      itemTypeId: item.item_type_id || '',
      subcategoryId: item.subcategory_id || '',
      sequence: item.sequence_number?.toString() || '',
      zone: '',
      area: item.area || '',
      brand: item.supplier || '',
      finishing: item.finish_material || '',
      size: item.dimensions || '',
      productionTime: item.production_time || '',
      description: item.description || '',
      refImage: item.reference_image_url || '',
      techDrawings: item.technical_drawing_url || '',
      companyLink: item.company_product_url || '',
      qty: (item.quantity || 1).toString(),
      unit: 'pcs',
      unitRate: item.unit_cost?.toString() || '',
      notes: item.notes || '',
    });
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDuplicate = () => {
    if (items.length === 0) { toast.error('No items to duplicate'); return; }
    const last = items[items.length - 1];
    handleEdit(last);
    setEditingItemId(null); // It's a new item based on last
    setForm(prev => ({ ...prev }));
    toast.info('Duplicated last item — modify and save');
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    try {
      await deleteItem.mutateAsync({ id: itemToDelete.id, projectId });
      toast.success('Item deleted');
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    } catch {
      toast.error('Failed to delete');
    }
  };

  // Lookups for display
  const floorMap = useMemo(() => new Map(floors.map(f => [f.id, f])), [floors]);
  const roomMap = useMemo(() => new Map(rooms.map(r => [r.id, r])), [rooms]);

  const renderLinks = (text: string | null) => {
    if (!text) return <span className="text-muted-foreground text-xs">-</span>;
    const links = text.split('\n').filter(l => l.trim());
    if (links.length === 0) return <span className="text-muted-foreground text-xs">-</span>;
    return (
      <div className="flex gap-1">
        {links.map((link, i) => (
          <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline">
            <ExternalLink className="w-3 h-3 inline" /> {i + 1}
          </a>
        ))}
      </div>
    );
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <TableHead
      className="cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap"
      onClick={() => toggleSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="w-3 h-3 opacity-50" />
      </span>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.totalItems}</p>
          <p className="text-xs text-muted-foreground">Total Items</p>
        </div>
        {canSeeCosts && (
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-foreground font-mono">€{stats.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground">Total Amount</p>
          </div>
        )}
        <div className="bg-gradient-to-br from-status-unsafe/10 to-status-unsafe/5 border border-status-unsafe/20 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-status-unsafe">{stats.missingPrices}</p>
          <p className="text-xs text-muted-foreground">Missing Prices</p>
        </div>
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.uniqueFloors}</p>
          <p className="text-xs text-muted-foreground">Floors</p>
        </div>
      </div>

      {/* Entry Form */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          {editingItemId ? '✏️ Edit Item' : '➕ Add New Item'}
          {editingItemId && (
            <Badge variant="outline" className="text-xs">Editing</Badge>
          )}
        </h2>

        {/* Row 1: Location + Classification */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Floor</Label>
            <SearchableSelect options={floorOptions} value={form.floorId} onValueChange={v => updateField('floorId', v)} placeholder="Floor..." searchPlaceholder="Search floors..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Room</Label>
            <SearchableSelect options={roomOptions} value={form.roomId} onValueChange={v => updateField('roomId', v)} placeholder="Room..." searchPlaceholder="Search rooms..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Room #</Label>
            <Input value={form.roomNumber} onChange={e => updateField('roomNumber', e.target.value)} placeholder="01" className="font-mono" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Item Type</Label>
            <SearchableSelect options={itemTypeOptions} value={form.itemTypeId} onValueChange={v => updateField('itemTypeId', v)} placeholder="Type..." searchPlaceholder="Search types..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Subcategory</Label>
            <SearchableSelect
              options={filteredSubcategories}
              value={form.subcategoryId}
              onValueChange={v => updateField('subcategoryId', v)}
              placeholder={form.itemTypeId ? 'Select...' : 'Select type first'}
              disabled={!form.itemTypeId}
              searchPlaceholder="Search..."
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Seq</Label>
            <Input value={form.sequence} onChange={e => updateField('sequence', e.target.value)} placeholder="001" className="font-mono" />
          </div>
        </div>

        {/* Code Preview */}
        <div className={cn(
          'text-center font-mono text-lg font-bold tracking-widest py-3 rounded-md',
          codePreview ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'
        )}>
          {codePreview || '[Generated Code Will Appear Here]'}
        </div>

        {/* Row 2: Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Zone</Label>
            <Input value={form.zone} onChange={e => updateField('zone', e.target.value)} placeholder="Zone" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Area</Label>
            <Input value={form.area} onChange={e => updateField('area', e.target.value)} placeholder="Area" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Brand / Supplier</Label>
            <Input value={form.brand} onChange={e => updateField('brand', e.target.value)} placeholder="Brand" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Finishing</Label>
            <Input value={form.finishing} onChange={e => updateField('finishing', e.target.value)} placeholder="Finish" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Size / Dimensions</Label>
            <Input value={form.size} onChange={e => updateField('size', e.target.value)} placeholder="Size" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Production Time</Label>
            <Input value={form.productionTime} onChange={e => updateField('productionTime', e.target.value)} placeholder="e.g. 4-6 weeks" />
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <Label className="text-xs">Description</Label>
          <Textarea value={form.description} onChange={e => updateField('description', e.target.value)} placeholder="Detailed description" rows={3} />
        </div>

        {/* Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Reference Image Link</Label>
            <Input value={form.refImage} onChange={e => updateField('refImage', e.target.value)} placeholder="Image URL" type="url" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Technical Drawings Links</Label>
            <Textarea value={form.techDrawings} onChange={e => updateField('techDrawings', e.target.value)} placeholder="One link per line" rows={2} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Company Product Links</Label>
            <Textarea value={form.companyLink} onChange={e => updateField('companyLink', e.target.value)} placeholder="One link per line" rows={2} />
          </div>
        </div>

        {/* Qty + Price */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Quantity</Label>
            <Input type="number" value={form.qty} onChange={e => updateField('qty', e.target.value)} placeholder="Qty" min="0" step="0.01" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unit</Label>
            <Select value={form.unit} onValueChange={v => updateField('unit', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pcs">pcs</SelectItem>
                <SelectItem value="mq">mq (m²)</SelectItem>
                <SelectItem value="ml">ml (m)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {canSeeCosts && (
            <div className="space-y-1">
              <Label className="text-xs">Unit Rate (€)</Label>
              <Input type="number" value={form.unitRate} onChange={e => updateField('unitRate', e.target.value)} placeholder="Price" min="0" step="0.01" />
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <Label className="text-xs">Notes</Label>
          <Textarea value={form.notes} onChange={e => updateField('notes', e.target.value)} placeholder="Additional notes" rows={2} />
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 flex-wrap">
          <Button onClick={handleSubmit} disabled={createItem.isPending || updateItem.isPending}>
            {(createItem.isPending || updateItem.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Plus className="w-4 h-4 mr-2" />
            {editingItemId ? 'Update Item' : 'Add Item'}
          </Button>
          <Button variant="outline" onClick={handleDuplicate}>
            <Copy className="w-4 h-4 mr-2" />
            Duplicate Last
          </Button>
          <Button variant="outline" onClick={() => clearForm()}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Clear Form
          </Button>
          {editingItemId && (
            <Button variant="ghost" onClick={() => clearForm()}>Cancel Edit</Button>
          )}
        </div>
      </div>

      {/* Column Toggle */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setShowColumnToggle(!showColumnToggle)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
        >
          <span className="flex items-center gap-2">
            {showColumnToggle ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            Show/Hide Columns
          </span>
        </button>
        {showColumnToggle && (
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {ALL_COLUMNS.map(col => (
              <label key={col.key} className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs cursor-pointer transition-colors',
                isCol(col.key) ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-muted border-border text-muted-foreground'
              )}>
                <Checkbox checked={isCol(col.key)} onCheckedChange={() => toggleColumn(col.key)} className="w-3 h-3" />
                {col.label}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="🔍 Search items..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {isCol('image') && <TableHead className="w-[50px]">Img</TableHead>}
                <SortHeader field="code" label="Code" />
                <SortHeader field="floor" label="Floor" />
                <SortHeader field="room" label="Room" />
                {isCol('zone') && <SortHeader field="zone" label="Zone" />}
                {isCol('area') && <SortHeader field="area" label="Area" />}
                {isCol('brand') && <SortHeader field="brand" label="Brand" />}
                <TableHead>Description</TableHead>
                {isCol('finishing') && <TableHead>Finishing</TableHead>}
                {isCol('size') && <TableHead>Size</TableHead>}
                {isCol('tech') && <TableHead>Tech</TableHead>}
                {isCol('refImg') && <TableHead>Ref Img</TableHead>}
                {isCol('coLink') && <TableHead>Co.Link</TableHead>}
                <SortHeader field="qty" label="QTY" />
                <TableHead>Unit</TableHead>
                {isCol('unitRate') && canSeeCosts && <SortHeader field="unitRate" label="Unit Rate" />}
                {isCol('amount') && canSeeCosts && <SortHeader field="amount" label="Amount" />}
                {isCol('prodTime') && <TableHead>Prod.Time</TableHead>}
                {isCol('notes') && <TableHead>Notes</TableHead>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={20} className="text-center py-10 text-muted-foreground">
                    No items. Start adding!
                  </TableCell>
                </TableRow>
              ) : (
                displayItems.map(item => {
                  const floor = floorMap.get(item.floor_id || '');
                  const room = roomMap.get(item.room_id || '');
                  const rowColor = getRoomColor(floor?.code || '', room?.code || '', item.room_number || '01');
                  const amount = (item.unit_cost || 0) * (item.quantity || 1);
                  const isMissingPrice = !item.unit_cost || item.unit_cost === 0;
                  const isCustom = item.item_code?.includes('-CF');

                  return (
                    <TableRow key={item.id} style={{ backgroundColor: rowColor }} className="[&_td]:text-gray-900">
                      {isCol('image') && (
                        <TableCell>
                          {item.reference_image_url ? (
                            <img
                              src={item.reference_image_url}
                              alt=""
                              className="w-10 h-10 object-cover rounded cursor-pointer border border-gray-300"
                              onClick={() => window.open(item.reference_image_url!, '_blank')}
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded border border-gray-300 bg-white/50 flex items-center justify-center">
                              <ImageIcon className="w-4 h-4 text-gray-400" />
                            </div>
                          )}
                        </TableCell>
                      )}
                      <TableCell className={cn('font-mono text-xs font-bold', isCustom ? 'text-red-700' : 'text-gray-900')}>
                        {item.item_code || '-'}
                      </TableCell>
                      <TableCell className="text-xs text-gray-800">{floor?.code || '-'}</TableCell>
                      <TableCell className="text-xs text-gray-800">{room?.code || ''}{item.room_number || ''}</TableCell>
                      {isCol('zone') && <TableCell className="text-xs text-gray-800">{item.area || '-'}</TableCell>}
                      {isCol('area') && <TableCell className="text-xs text-gray-800">{item.area || '-'}</TableCell>}
                      {isCol('brand') && <TableCell className="text-xs text-gray-800">{item.supplier || '-'}</TableCell>}
                      <TableCell className="text-sm max-w-[200px] truncate text-gray-900 font-medium" title={item.description}>{item.description}</TableCell>
                      {isCol('finishing') && <TableCell className="text-xs text-gray-800">{item.finish_material || '-'}</TableCell>}
                      {isCol('size') && <TableCell className="text-xs text-gray-800">{item.dimensions || '-'}</TableCell>}
                      {isCol('tech') && <TableCell>{renderLinks(item.technical_drawing_url)}</TableCell>}
                      {isCol('refImg') && (
                        <TableCell>
                          {item.reference_image_url ? (
                            <a href={item.reference_image_url} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline">
                              LINK
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                      )}
                      {isCol('coLink') && <TableCell>{renderLinks(item.company_product_url)}</TableCell>}
                      <TableCell className="text-xs font-mono">{item.quantity || 1}</TableCell>
                      <TableCell className="text-xs">pcs</TableCell>
                      {isCol('unitRate') && canSeeCosts && (
                        <TableCell className={cn('text-xs font-mono text-right', isMissingPrice && 'bg-destructive/10 font-bold text-destructive')}>
                          {item.unit_cost ? `€${Number(item.unit_cost).toFixed(2)}` : '-'}
                        </TableCell>
                      )}
                      {isCol('amount') && canSeeCosts && (
                        <TableCell className="text-xs font-mono text-right font-bold">
                          €{amount.toFixed(2)}
                        </TableCell>
                      )}
                      {isCol('prodTime') && <TableCell className="text-xs">{item.production_time || '-'}</TableCell>}
                      {isCol('notes') && <TableCell className="text-xs max-w-[150px] truncate" title={item.notes || ''}>{item.notes || '-'}</TableCell>}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(item)}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => { setItemToDelete(item); setDeleteDialogOpen(true); }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Delete dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{itemToDelete?.description}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
