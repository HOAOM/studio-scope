import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupplierComments, useAddSupplierComment, type Supplier } from '@/hooks/useSuppliers';
import { Star, Loader2, MessageSquare, Send, Mail, Phone, MapPin, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
}

export function SupplierDetailModal({ open, onOpenChange, supplier }: Props) {
  const [comment, setComment] = useState('');
  const { data: comments = [] } = useSupplierComments(supplier?.id);
  const addComment = useAddSupplierComment();

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ['supplier-items', supplier?.name],
    enabled: !!supplier?.name && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_items')
        .select('id, description, category, lifecycle_status, delivery_date, project_id, projects(name)')
        .eq('supplier', supplier!.name)
        .order('updated_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  if (!supplier) return null;

  const handleSend = async () => {
    if (!comment.trim()) return;
    await addComment.mutateAsync({ supplier_id: supplier.id, body: comment.trim() });
    setComment('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{supplier.name}</span>
            <div className="flex items-center gap-0.5">
              {[1,2,3,4,5].map(n => (
                <Star key={n} className={cn('w-4 h-4', n <= supplier.rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
              ))}
            </div>
          </DialogTitle>
          <DialogDescription>Scheda fornitore — anagrafica, item forniti, commenti interni.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {supplier.contact_person && <div className="flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" />{supplier.contact_person}</div>}
          {supplier.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" />{supplier.email}</div>}
          {supplier.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" />{supplier.phone}</div>}
          {(supplier.city || supplier.country) && <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" />{[supplier.city, supplier.country].filter(Boolean).join(', ')}</div>}
        </div>

        {supplier.categories?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {supplier.categories.map(c => <Badge key={c} variant="secondary">{c}</Badge>)}
          </div>
        )}

        {supplier.notes && (
          <div className="text-sm text-muted-foreground border border-border rounded-md p-3 bg-secondary/30">
            {supplier.notes}
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold mb-2">Item Forniti (ultimi 20)</h3>
          {loadingItems ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun item associato.</p>
          ) : (
            <div className="overflow-x-auto border border-border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-secondary/60">
                  <tr>
                    <th className="text-left p-2">Progetto</th>
                    <th className="text-left p-2">Descrizione</th>
                    <th className="text-left p-2">Categoria</th>
                    <th className="text-left p-2">Stato</th>
                    <th className="text-left p-2">Data PO</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any) => (
                    <tr key={it.id} className="border-t border-border">
                      <td className="p-2">{it.projects?.name || '—'}</td>
                      <td className="p-2 max-w-[280px] truncate">{it.description}</td>
                      <td className="p-2">{it.category}</td>
                      <td className="p-2">{it.lifecycle_status}</td>
                      <td className="p-2">{it.delivery_date ? format(new Date(it.delivery_date), 'dd/MM/yyyy') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Commenti</h3>
          <div className="space-y-2 mb-3 max-h-60 overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun commento.</p>
            ) : comments.map(c => (
              <div key={c.id} className="text-sm border border-border rounded-md p-2 bg-secondary/30">
                <p>{c.body}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(c.created_at), 'dd MMM yyyy HH:mm')}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Textarea rows={2} placeholder="Aggiungi commento interno..." value={comment} onChange={e => setComment(e.target.value)} />
            <Button onClick={handleSend} disabled={addComment.isPending || !comment.trim()}>
              {addComment.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
