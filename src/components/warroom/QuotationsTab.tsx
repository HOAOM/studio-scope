/**
 * QuotationsTab — Multi-option quotations per item, with accept/reject flow
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Plus, Check, X, Trash2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import {
  useItemQuotations,
  useCreateQuotation,
  useUpdateQuotation,
  useDeleteQuotation,
  type ItemQuotation,
} from '@/hooks/useQuotations';

interface QuotationsTabProps {
  itemId: string;
  canEdit?: boolean;
}

export function QuotationsTab({ itemId, canEdit = true }: QuotationsTabProps) {
  const { data: quotations = [], isLoading } = useItemQuotations(itemId);
  const createQuotation = useCreateQuotation();
  const updateQuotation = useUpdateQuotation();
  const deleteQuotation = useDeleteQuotation();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ supplier: '', description: '', unit_price: '', total_price: '', lead_time_days: '', notes: '' });

  const handleCreate = async () => {
    if (!form.supplier.trim()) { toast.error('Supplier is required'); return; }
    try {
      await createQuotation.mutateAsync({
        project_item_id: itemId,
        supplier: form.supplier,
        description: form.description || null,
        unit_price: form.unit_price ? parseFloat(form.unit_price) : null,
        total_price: form.total_price ? parseFloat(form.total_price) : null,
        lead_time_days: form.lead_time_days ? parseInt(form.lead_time_days) : null,
        notes: form.notes || null,
        status: 'proposed',
      });
      setForm({ supplier: '', description: '', unit_price: '', total_price: '', lead_time_days: '', notes: '' });
      setShowForm(false);
      toast.success('Quotation added');
    } catch { toast.error('Failed to add quotation'); }
  };

  const handleAccept = async (q: ItemQuotation) => {
    try {
      // Reject all others first
      const others = quotations.filter(o => o.id !== q.id && o.status === 'proposed');
      await Promise.all(others.map(o =>
        updateQuotation.mutateAsync({ id: o.id, project_item_id: itemId, status: 'rejected' })
      ));
      await updateQuotation.mutateAsync({ id: q.id, project_item_id: itemId, status: 'accepted' });
      toast.success('Quotation accepted — others rejected');
    } catch { toast.error('Failed to accept'); }
  };

  const handleReject = async (q: ItemQuotation) => {
    try {
      await updateQuotation.mutateAsync({ id: q.id, project_item_id: itemId, status: 'rejected' });
      toast.success('Quotation rejected');
    } catch { toast.error('Failed to reject'); }
  };

  const handleDelete = async (q: ItemQuotation) => {
    try {
      await deleteQuotation.mutateAsync({ id: q.id, itemId });
      toast.success('Quotation deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const statusColors: Record<string, string> = {
    proposed: 'bg-status-at-risk-bg text-status-at-risk',
    accepted: 'bg-status-safe-bg text-status-safe',
    rejected: 'bg-status-unsafe-bg text-status-unsafe',
  };

  if (isLoading) return <p className="text-sm text-muted-foreground py-4 text-center">Loading quotations...</p>;

  const accepted = quotations.find(q => q.status === 'accepted');

  return (
    <div className="space-y-4">
      {accepted && (
        <div className="p-3 rounded-lg border-2 border-status-safe/30 bg-status-safe-bg/50">
          <div className="flex items-center gap-2 mb-1">
            <Check className="w-4 h-4 text-status-safe" />
            <span className="text-sm font-semibold text-status-safe">Accepted Quotation</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Supplier:</span> <span className="font-medium">{accepted.supplier}</span></div>
            {accepted.total_price != null && <div><span className="text-muted-foreground">Total:</span> <span className="font-mono font-medium">{accepted.total_price.toFixed(2)}</span></div>}
            {accepted.lead_time_days != null && <div><span className="text-muted-foreground">Lead time:</span> <span>{accepted.lead_time_days} days</span></div>}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Quotation Options ({quotations.length})</h4>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} className="h-7 text-[11px]">
            <Plus className="w-3 h-3 mr-1" /> Add Option
          </Button>
        )}
      </div>

      {showForm && (
        <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Supplier *</Label>
              <Input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Supplier name" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Unit Price</Label>
              <Input type="number" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} placeholder="0.00" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Total Price</Label>
              <Input type="number" value={form.total_price} onChange={e => setForm(f => ({ ...f, total_price: e.target.value }))} placeholder="0.00" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Lead Time (days)</Label>
              <Input type="number" value={form.lead_time_days} onChange={e => setForm(f => ({ ...f, lead_time_days: e.target.value }))} placeholder="12" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={createQuotation.isPending} className="h-7 text-[11px]">Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} className="h-7 text-[11px]">Cancel</Button>
          </div>
        </div>
      )}

      {quotations.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground py-4 text-center">No quotations yet. Add supplier options to compare.</p>
      )}

      <div className="space-y-2">
        {quotations.map(q => (
          <div key={q.id} className={cn('flex items-center justify-between rounded-lg px-3 py-2 border', q.status === 'accepted' ? 'border-status-safe/30 bg-status-safe-bg/30' : q.status === 'rejected' ? 'border-border/50 bg-muted/20 opacity-60' : 'border-border')}>
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{q.supplier}</span>
                  <Badge className={cn('text-[9px] h-4', statusColors[q.status])}>{q.status}</Badge>
                </div>
                {q.description && <p className="text-xs text-muted-foreground truncate">{q.description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3 ml-3 shrink-0">
              {q.total_price != null && <span className="text-sm font-mono font-medium">{q.total_price.toFixed(2)}</span>}
              {q.lead_time_days != null && <span className="text-xs text-muted-foreground">{q.lead_time_days}d</span>}
              {canEdit && q.status === 'proposed' && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-status-safe hover:bg-status-safe-bg" onClick={() => handleAccept(q)}>
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-status-unsafe hover:bg-status-unsafe-bg" onClick={() => handleReject(q)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
              {canEdit && (
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(q)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
