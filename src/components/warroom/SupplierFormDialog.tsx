import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Star, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORY_OPTIONS } from '@/lib/categories';
import { useCreateSupplier, useUpdateSupplier, type Supplier } from '@/hooks/useSuppliers';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier | null;
}

export function SupplierFormDialog({ open, onOpenChange, supplier }: Props) {
  const isEdit = !!supplier;
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const saving = create.isPending || update.isPending;

  const [form, setForm] = useState({
    name: '', contact_person: '', email: '', phone: '',
    country: '', city: '', notes: '',
  });
  const [categories, setCategories] = useState<string[]>([]);
  const [rating, setRating] = useState(0);

  useEffect(() => {
    if (open) {
      setForm({
        name: supplier?.name || '',
        contact_person: supplier?.contact_person || '',
        email: supplier?.email || '',
        phone: supplier?.phone || '',
        country: supplier?.country || '',
        city: supplier?.city || '',
        notes: supplier?.notes || '',
      });
      setCategories(supplier?.categories || []);
      setRating(supplier?.rating || 0);
    }
  }, [open, supplier]);

  const toggleCat = (val: string) => {
    setCategories(prev => prev.includes(val) ? prev.filter(c => c !== val) : [...prev, val]);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Il nome è obbligatorio');
      return;
    }
    const payload = { ...form, categories, rating };
    try {
      if (isEdit && supplier) {
        await update.mutateAsync({ id: supplier.id, ...payload });
      } else {
        await create.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Modifica Fornitore' : 'Nuovo Fornitore'}</DialogTitle>
          <DialogDescription>Dati anagrafici, categorie BOQ e rating del fornitore.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Referente</Label>
              <Input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Telefono</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Paese</Label>
              <Input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Città</Label>
              <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="mt-1" />
            </div>
          </div>

          <div>
            <Label>Categorie BOQ</Label>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-md border border-border bg-secondary/40">
              {CATEGORY_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={categories.includes(opt.value)} onCheckedChange={() => toggleCat(opt.value)} />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>Rating</Label>
            <div className="mt-1 flex items-center gap-1">
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button" onClick={() => setRating(n === rating ? 0 : n)}>
                  <Star className={cn('w-6 h-6 transition-colors',
                    n <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
                </button>
              ))}
              <span className="ml-2 text-xs text-muted-foreground">{rating}/5</span>
            </div>
          </div>

          <div>
            <Label>Note interne</Label>
            <Textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salva
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
