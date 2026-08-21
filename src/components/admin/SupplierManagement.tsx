import { useMemo, useState } from 'react';
import { useSuppliers, useDeleteSupplier, type Supplier } from '@/hooks/useSuppliers';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Eye, Star, Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SupplierFormDialog } from '@/components/warroom/SupplierFormDialog';
import { SupplierDetailModal } from '@/components/warroom/SupplierDetailModal';

export function SupplierManagement() {
  const { data: suppliers = [], isLoading } = useSuppliers();
  const del = useDeleteSupplier();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSupplier, setDetailSupplier] = useState<Supplier | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(s => s.name.toLowerCase().includes(q));
  }, [suppliers, search]);

  const handleNew = () => { setEditing(null); setFormOpen(true); };
  const handleEdit = (s: Supplier) => { setEditing(s); setFormOpen(true); };
  const handleDetail = (s: Supplier) => { setDetailSupplier(s); setDetailOpen(true); };
  const handleDelete = async (s: Supplier) => {
    if (!confirm(`Eliminare il fornitore "${s.name}"?`)) return;
    await del.mutateAsync(s.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Cerca fornitore..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={handleNew}><Plus className="w-4 h-4 mr-2" />Nuovo Fornitore</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Nessun fornitore in anagrafica.</p>
      ) : (
        <div className="border border-border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60">
              <tr>
                <th className="text-left p-3">Nome</th>
                <th className="text-left p-3">Referente</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Tipo</th>
                <th className="text-left p-3">Categorie</th>
                <th className="text-left p-3">Rating</th>
                <th className="text-right p-3">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3 text-muted-foreground">{s.contact_person || '—'}</td>
                  <td className="p-3 text-muted-foreground">{s.email || '—'}</td>
                  <td className="p-3">
                    {s.is_subcontractor ? (
                      <Badge variant="outline" className="text-[10px] border-orange-500/50 text-orange-400 bg-orange-500/10">EXT</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {s.categories?.slice(0, 3).map(c => <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>)}
                      {s.categories?.length > 3 && <Badge variant="outline" className="text-[10px]">+{s.categories.length - 3}</Badge>}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-0.5">
                      {[1,2,3,4,5].map(n => (
                        <Star key={n} className={cn('w-3.5 h-3.5', n <= s.rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/40')} />
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleDetail(s)} title="Dettaglio"><Eye className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(s)} title="Modifica"><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(s)} title="Elimina" className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SupplierFormDialog open={formOpen} onOpenChange={setFormOpen} supplier={editing} />
      <SupplierDetailModal open={detailOpen} onOpenChange={setDetailOpen} supplier={detailSupplier} />
    </div>
  );
}
