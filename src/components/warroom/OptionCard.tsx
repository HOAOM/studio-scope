/**
 * OptionCard — Reusable card for item options (Design + Quotations views)
 * Shows image, finishes, supplier, links, pricing with inline edit support.
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useUpdateProjectItem } from '@/hooks/useProjects';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2, Pencil, Save, X, Image as ImageIcon,
  ExternalLink, Upload,
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];

interface OptionCardProps {
  option: ProjectItem;
  letter: string;
  isSelected: boolean;
  onSelect: () => void;
  parentId: string | null; // null if this IS the parent
  projectId: string;
  mode: 'design' | 'quotation';
  canSeeCosts?: boolean;
}

export function OptionCard({
  option, letter, isSelected, onSelect, parentId, projectId, mode, canSeeCosts,
}: OptionCardProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const updateItem = useUpdateProjectItem();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const startEdit = () => {
    setForm({
      description: option.description,
      finish_material: option.finish_material || '',
      finish_color: option.finish_color || '',
      finish_notes: option.finish_notes || '',
      production_time: option.production_time || '',
      supplier: option.supplier || '',
      dimensions: option.dimensions || '',
      reference_image_url: option.reference_image_url || '',
      technical_drawing_url: option.technical_drawing_url || '',
      company_product_url: option.company_product_url || '',
      unit_cost: option.unit_cost ?? '',
      quantity: option.quantity ?? 1,
      notes: option.notes || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    try {
      const numFields = ['unit_cost', 'quantity'];
      const payload: Record<string, any> = { id: option.id };
      for (const [k, v] of Object.entries(form)) {
        payload[k] = numFields.includes(k)
          ? (v !== '' && v != null ? Number(v) : null)
          : (v || null);
      }
      await updateItem.mutateAsync(payload as any);
      queryClient.invalidateQueries({ queryKey: ['item-options', parentId || option.id] });
      queryClient.invalidateQueries({ queryKey: ['item-detail', parentId || option.id] });
      queryClient.invalidateQueries({ queryKey: ['project-items', projectId] });
      toast.success('Option updated');
      setEditing(false);
    } catch {
      toast.error('Failed to update option');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${projectId}/${option.id}/ref_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('item-files').upload(path, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('item-files').getPublicUrl(path);
      setForm(f => ({ ...f, reference_image_url: urlData.publicUrl }));
      toast.success('Image uploaded');
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const imgUrl = editing ? form.reference_image_url : option.reference_image_url;

  // ─── EDIT MODE ───
  if (editing) {
    return (
      <div className="rounded-lg border-2 border-primary/40 bg-card p-3 space-y-3">
        <div className="flex items-center justify-between">
          <Badge className="text-xs">{letter}</Badge>
          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-[10px] px-2" onClick={handleSave} disabled={updateItem.isPending}>
              <Save className="w-3 h-3 mr-1" />Save
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setEditing(false)}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Image upload */}
        <div className="relative aspect-[4/3] bg-muted/30 rounded-lg overflow-hidden border border-border">
          {imgUrl ? (
            <img src={imgUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
              <ImageIcon className="w-8 h-8" />
            </div>
          )}
          <label className="absolute bottom-2 right-2 cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
            <div className="bg-background/80 backdrop-blur rounded-md px-2 py-1 text-[10px] font-medium flex items-center gap-1 border border-border hover:bg-background transition-colors">
              <Upload className="w-3 h-3" />{uploading ? 'Uploading...' : 'Upload'}
            </div>
          </label>
        </div>

        <div>
          <Label className="text-[10px]">Description</Label>
          <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="h-7 text-xs" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">Material</Label>
            <Input value={form.finish_material} onChange={e => setForm(f => ({ ...f, finish_material: e.target.value }))} className="h-7 text-xs" placeholder="e.g. Oak wood" />
          </div>
          <div>
            <Label className="text-[10px]">Color</Label>
            <Input value={form.finish_color} onChange={e => setForm(f => ({ ...f, finish_color: e.target.value }))} className="h-7 text-xs" placeholder="e.g. Natural" />
          </div>
        </div>

        <div>
          <Label className="text-[10px]">Finish Notes</Label>
          <Textarea value={form.finish_notes} onChange={e => setForm(f => ({ ...f, finish_notes: e.target.value }))} className="text-xs min-h-[40px]" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">Supplier</Label>
            <Input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} className="h-7 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">Production Time</Label>
            <Input value={form.production_time} onChange={e => setForm(f => ({ ...f, production_time: e.target.value }))} className="h-7 text-xs" placeholder="e.g. 8 weeks" />
          </div>
        </div>

        <div>
          <Label className="text-[10px]">Dimensions</Label>
          <Input value={form.dimensions} onChange={e => setForm(f => ({ ...f, dimensions: e.target.value }))} className="h-7 text-xs" placeholder="e.g. 120x80x45 cm" />
        </div>

        {canSeeCosts && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Unit Cost (€)</Label>
              <Input type="number" value={form.unit_cost} onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))} className="h-7 text-xs font-mono" />
            </div>
            <div>
              <Label className="text-[10px]">Quantity</Label>
              <Input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className="h-7 text-xs" />
            </div>
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-[10px]">Reference Image URL</Label>
          <Input value={form.reference_image_url} onChange={e => setForm(f => ({ ...f, reference_image_url: e.target.value }))} className="h-7 text-xs" placeholder="https://..." />
          <Label className="text-[10px]">Technical Drawing URL</Label>
          <Input value={form.technical_drawing_url} onChange={e => setForm(f => ({ ...f, technical_drawing_url: e.target.value }))} className="h-7 text-xs" placeholder="https://..." />
          <Label className="text-[10px]">Product Page URL</Label>
          <Input value={form.company_product_url} onChange={e => setForm(f => ({ ...f, company_product_url: e.target.value }))} className="h-7 text-xs" placeholder="https://..." />
        </div>

        <div>
          <Label className="text-[10px]">Notes</Label>
          <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="text-xs min-h-[40px]" />
        </div>
      </div>
    );
  }

  // ─── VIEW MODE ───
  return (
    <div
      className={cn(
        'rounded-lg border transition-all group',
        isSelected
          ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
          : 'border-border bg-card hover:border-muted-foreground/40 hover:shadow-sm'
      )}
    >
      {/* Image */}
      <div className="aspect-[4/3] relative bg-muted/30 rounded-t-lg overflow-hidden">
        {imgUrl ? (
          <img src={imgUrl} alt={`Option ${letter}`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/40">
            <ImageIcon className="w-8 h-8 mb-1" />
            <span className="text-[10px]">No image</span>
          </div>
        )}
        <Badge
          className={cn('absolute top-2 left-2 text-xs', isSelected ? 'bg-primary text-primary-foreground' : '')}
          variant={isSelected ? 'default' : 'secondary'}
        >
          {letter}
        </Badge>
        {isSelected && <CheckCircle2 className="absolute top-2 right-2 w-5 h-5 text-primary" />}
        {/* Edit pencil on hover */}
        <button
          onClick={startEdit}
          className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur rounded-md p-1 border border-border"
        >
          <Pencil className="w-3 h-3 text-foreground" />
        </button>
      </div>

      {/* Details */}
      <div className="p-3 space-y-1.5">
        <p className="text-sm font-medium text-foreground line-clamp-2">{option.description}</p>

        {(option.finish_material || option.finish_color) && (
          <div className="text-xs text-muted-foreground">
            {option.finish_material && <span className="font-medium text-foreground">{option.finish_material}</span>}
            {option.finish_material && option.finish_color && ' — '}
            {option.finish_color && <span>{option.finish_color}</span>}
          </div>
        )}
        {option.finish_notes && (
          <p className="text-[10px] text-muted-foreground line-clamp-2">{option.finish_notes}</p>
        )}
        {option.supplier && (
          <p className="text-xs text-muted-foreground">
            Supplier: <span className="font-medium text-foreground">{option.supplier}</span>
          </p>
        )}
        {option.dimensions && (
          <p className="text-xs text-muted-foreground">
            Size: <span className="font-medium text-foreground">{option.dimensions}</span>
          </p>
        )}
        {option.production_time && (
          <p className="text-xs text-muted-foreground">
            Lead: <span className="font-medium text-foreground">{option.production_time}</span>
          </p>
        )}

        {/* Pricing (always visible if canSeeCosts) */}
        {canSeeCosts && option.unit_cost != null && (
          <div className="pt-1 border-t border-border mt-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Unit Cost</span>
              <span className="font-mono font-medium text-foreground">€{Number(option.unit_cost).toFixed(2)}</span>
            </div>
            {option.quantity && option.quantity > 1 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Qty × {option.quantity}</span>
                <span className="font-mono font-medium text-foreground">€{(Number(option.unit_cost) * option.quantity).toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {/* Links */}
        <div className="flex flex-wrap gap-2 pt-1">
          {option.reference_image_url && (
            <a href={option.reference_image_url} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
              <ExternalLink className="w-2.5 h-2.5" /> Image
            </a>
          )}
          {option.company_product_url && (
            <a href={option.company_product_url} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
              <ExternalLink className="w-2.5 h-2.5" /> Product
            </a>
          )}
          {option.technical_drawing_url && (
            <a href={option.technical_drawing_url} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
              <ExternalLink className="w-2.5 h-2.5" /> Drawing
            </a>
          )}
        </div>

        {/* Select button */}
        {!isSelected ? (
          <Button size="sm" variant="outline" className="w-full h-7 text-xs mt-2" onClick={onSelect}>
            Select as Client Choice
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="w-full h-7 text-xs mt-2 text-primary" onClick={onSelect}>
            <CheckCircle2 className="w-3 h-3 mr-1" /> Selected — Click to change
          </Button>
        )}
      </div>
    </div>
  );
}
