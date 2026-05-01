import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Trash2, Loader2, ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle } from 'lucide-react';
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
  hideSortOrder?: boolean;
  searchable?: boolean;
  sortable?: boolean;
  flagDuplicateKey?: string;
}

export function MasterDataTable({ title, columns, data, isLoading, onSave, onDelete, isSaving, isDeleting, hideSortOrder, searchable, sortable, flagDuplicateKey }: MasterDataTableProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string>('code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Compute duplicate codes for visual flagging
  const duplicateValues = (() => {
    if (!flagDuplicateKey) return new Set<string>();
    const counts = new Map<string, number>();
    data.forEach(it => {
      const v = String(it[flagDuplicateKey] ?? '').trim();
      if (!v) return;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    });
    return new Set(Array.from(counts.entries()).filter(([, n]) => n > 1).map(([k]) => k));
  })();

  const getSortValue = (item: any, key: string): string => {
    if (key === 'item_type_id') {
      return item.master_item_types
        ? `${item.master_item_types.code} ${item.master_item_types.name}`.toLowerCase()
        : '';
    }
    const v = item[key];
    if (Array.isArray(v)) return v.join(', ').toLowerCase();
    return String(v ?? '').toLowerCase();
  };

  const filteredData = (() => {
    let arr = data;
    if (searchable && search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(item =>
        columns.some(c => {
          const v = c.key === 'item_type_id' && item.master_item_types
            ? `${item.master_item_types.code} ${item.master_item_types.name}`
            : String(item[c.key] ?? '');
          return v.toLowerCase().includes(q);
        })
      );
    }
    if (sortable) {
      arr = [...arr].sort((a, b) => {
        const av = getSortValue(a, sortKey);
        const bv = getSortValue(b, sortKey);
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return arr;
  })();

  const toggleSort = (key: string) => {
    if (!sortable) return;
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

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
    columns.forEach(c => {
      const val = item[c.key];
      d[c.key] = Array.isArray(val) ? val.join(', ') : String(val ?? '');
    });
    d['sort_order'] = String(item.sort_order ?? 0);
    setFormData(d);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const payload: any = { ...formData };
      if (!hideSortOrder) payload.sort_order = parseInt(formData.sort_order || '0');
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
      <div className="flex items-center justify-between mb-4 gap-3">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <div className="flex items-center gap-2 flex-1 justify-end">
          {searchable && (
            <Input
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-xs h-8"
            />
          )}
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" />Add</Button>
        </div>
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(c => {
                const isActive = sortable && sortKey === c.key;
                const Arrow = !sortable ? null : isActive
                  ? (sortDir === 'asc' ? ArrowUp : ArrowDown)
                  : ArrowUpDown;
                return (
                  <TableHead
                    key={c.key}
                    className={sortable ? 'cursor-pointer select-none hover:text-foreground' : undefined}
                    onClick={() => toggleSort(c.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {Arrow && <Arrow className={`w-3 h-3 ${isActive ? 'text-primary' : 'text-muted-foreground/60'}`} />}
                    </span>
                  </TableHead>
                );
              })}
              {!hideSortOrder && <TableHead className="w-16">Order</TableHead>}
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length + (hideSortOrder ? 1 : 2)} className="text-center text-muted-foreground py-8">No data</TableCell></TableRow>
            ) : (
              filteredData.map(item => {
                const isDup = !!flagDuplicateKey && duplicateValues.has(String(item[flagDuplicateKey] ?? '').trim());
                return (
                <TableRow key={item.id} className={`tracker-row ${isDup ? 'bg-destructive/10' : ''}`}>
                  {columns.map(c => {
                    const val = item[c.key];
                    let display: string;
                    if (c.key === 'item_type_id' && item.master_item_types) {
                      display = `${item.master_item_types.code} - ${item.master_item_types.name}`;
                    } else if (c.key === 'item_type_id' && !val) {
                      display = '—';
                    } else if (Array.isArray(val)) {
                      display = val.join(', ');
                    } else {
                      display = String(val ?? '');
                    }
                    const showDupBadge = isDup && c.key === flagDuplicateKey;
                    return (
                      <TableCell key={c.key} className="font-mono text-sm">
                        <span className="inline-flex items-center gap-2">
                          {display}
                          {showDupBadge && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-destructive/20 text-destructive border border-destructive/40">
                              <AlertTriangle className="w-2.5 h-2.5" />DUP
                            </span>
                          )}
                        </span>
                      </TableCell>
                    );
                  })}
                  {!hideSortOrder && (
                    <TableCell className="font-mono text-sm text-muted-foreground">{item.sort_order ?? 0}</TableCell>
                  )}
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
                  <Select
                    value={formData[col.key] && formData[col.key].length > 0 ? formData[col.key] : '__none__'}
                    onValueChange={v => setFormData(p => ({ ...p, [col.key]: v === '__none__' ? '' : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder={`Select ${col.label}`} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— none —</SelectItem>
                      {col.options?.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={formData[col.key] || ''} onChange={e => setFormData(p => ({ ...p, [col.key]: e.target.value }))} />
                )}
              </div>
            ))}
            {!hideSortOrder && (
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Sort Order</label>
                <Input type="number" value={formData.sort_order || '0'} onChange={e => setFormData(p => ({ ...p, sort_order: e.target.value }))} />
              </div>
            )}
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
