import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Column {
  key: string;
  label: string;
  type?: 'text' | 'select';
  options?: { value: string; label: string }[];
}

interface MasterDataTableProps {
  title: string;
  columns: Column[];
  data: any[];
  isLoading: boolean;
  onSave: (item: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isSaving: boolean;
  isDeleting: boolean;
}

export function MasterDataTable({ title, columns, data, isLoading, onSave, onDelete, isSaving, isDeleting }: MasterDataTableProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});

  const openNew = () => {
    setEditItem(null);
    const empty: Record<string, string> = {};
    columns.forEach(c => { empty[c.key] = ''; });
    empty['sort_order'] = '0';
    setFormData(empty);
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    const d: Record<string, string> = {};
    columns.forEach(c => { d[c.key] = String(item[c.key] ?? ''); });
    d['sort_order'] = String(item.sort_order ?? 0);
    setFormData(d);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const payload: any = { ...formData, sort_order: parseInt(formData.sort_order || '0') };
      if (editItem) payload.id = editItem.id;
      await onSave(payload);
      toast.success(editItem ? 'Updated' : 'Created');
      setDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message || 'Error saving');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await onDelete(deleteId);
      toast.success('Deleted');
      setDeleteDialogOpen(false);
      setDeleteId(null);
    } catch (e: any) {
      toast.error(e.message || 'Error deleting');
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" />Add</Button>
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(c => <TableHead key={c.key}>{c.label}</TableHead>)}
              <TableHead className="w-16">Order</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length + 2} className="text-center text-muted-foreground py-8">No data</TableCell></TableRow>
            ) : (
              data.map(item => (
                <TableRow key={item.id} className="tracker-row">
                  {columns.map(c => (
                    <TableCell key={c.key} className="font-mono text-sm">
                      {c.key === 'item_type_id' && item.master_item_types
                        ? `${item.master_item_types.code} - ${item.master_item_types.name}`
                        : String(item[c.key] ?? '')}
                    </TableCell>
                  ))}
                  <TableCell className="font-mono text-sm text-muted-foreground">{item.sort_order ?? 0}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}><Edit className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { setDeleteId(item.id); setDeleteDialogOpen(true); }}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit' : 'New'} {title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {columns.map(col => (
              <div key={col.key}>
                <label className="text-sm font-medium text-foreground mb-1 block">{col.label}</label>
                {col.type === 'select' ? (
                  <Select value={formData[col.key] || ''} onValueChange={v => setFormData(p => ({ ...p, [col.key]: v }))}>
                    <SelectTrigger><SelectValue placeholder={`Select ${col.label}`} /></SelectTrigger>
                    <SelectContent>
                      {col.options?.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={formData[col.key] || ''} onChange={e => setFormData(p => ({ ...p, [col.key]: e.target.value }))} />
                )}
              </div>
            ))}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Sort Order</label>
              <Input type="number" value={formData.sort_order || '0'} onChange={e => setFormData(p => ({ ...p, sort_order: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>{isSaving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entry</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. Items referencing this entry may be affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground" disabled={isDeleting}>
              {isDeleting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
