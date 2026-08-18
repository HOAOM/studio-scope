import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface DiscountRow {
  id: string;
  code: string;
  percent_off: number | null;
  amount_off: number | null;
  scope_tier: string | null;
  is_active: boolean;
  valid_until: string | null;
  max_redemptions: number | null;
  total_redemptions: number;
  description: string | null;
  created_at: string;
}

export function DiscountCodesPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: '', percent_off: '', amount_off: '', scope_tier: 'all',
    max_redemptions: '', description: '',
  });

  const { data: codes = [], isLoading } = useQuery<DiscountRow[]>({
    queryKey: ['discount-codes'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('discount_codes').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload: any = {
        code: form.code.trim().toUpperCase(),
        description: form.description || null,
        percent_off: form.percent_off ? Number(form.percent_off) : null,
        amount_off: form.amount_off ? Number(form.amount_off) : null,
        scope_tier: form.scope_tier === 'all' ? null : form.scope_tier,
        max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : null,
        is_active: true,
      };
      const { error } = await (supabase as any).from('discount_codes').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discount-codes'] });
      toast.success('Discount code created');
      setOpen(false);
      setForm({ code: '', percent_off: '', amount_off: '', scope_tier: 'all', max_redemptions: '', description: '' });
    },
    onError: (e: any) => toast.error(e?.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await (supabase as any)
        .from('discount_codes').update({ is_active: active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discount-codes'] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('discount_codes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discount-codes'] });
      toast.success('Deleted');
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Discount codes</CardTitle>
        <Button size="sm" onClick={() => setOpen((v) => !v)}>
          <Plus className="w-4 h-4 mr-1" /> New code
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {open && (
          <form
            className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3 rounded-md bg-muted/30 border"
            onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
          >
            <div className="space-y-1">
              <Label className="text-xs">Code</Label>
              <Input required value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">% off</Label>
              <Input type="number" min={0} max={100} value={form.percent_off}
                onChange={(e) => setForm({ ...form, percent_off: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">€ off</Label>
              <Input type="number" min={0} value={form.amount_off}
                onChange={(e) => setForm({ ...form, amount_off: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Scope tier</Label>
              <Select value={form.scope_tier} onValueChange={(v) => setForm({ ...form, scope_tier: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tiers</SelectItem>
                  <SelectItem value="basic">Starter</SelectItem>
                  <SelectItem value="advanced">Pro</SelectItem>
                  <SelectItem value="pro">Business</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max redemptions</Label>
              <Input type="number" min={1} value={form.max_redemptions}
                onChange={(e) => setForm({ ...form, max_redemptions: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="col-span-full flex justify-end">
              <Button type="submit" size="sm" disabled={create.isPending}>
                {create.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Save
              </Button>
            </div>
          </form>
        )}

        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : codes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No discount codes yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className="text-center">Used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell className="text-xs">
                    {c.percent_off ? `${c.percent_off}%` : c.amount_off ? `€${c.amount_off}` : '—'}
                  </TableCell>
                  <TableCell className="text-xs capitalize">{c.scope_tier ?? 'all tiers'}</TableCell>
                  <TableCell className="text-center text-xs">
                    {c.total_redemptions}{c.max_redemptions ? ` / ${c.max_redemptions}` : ''}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => toggle.mutate({ id: c.id, active: !c.is_active })}
                      className="cursor-pointer"
                    >
                      <Badge variant={c.is_active ? 'default' : 'secondary'}>
                        {c.is_active ? 'active' : 'inactive'}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => del.mutate(c.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
