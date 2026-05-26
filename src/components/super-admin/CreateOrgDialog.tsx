import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Copy } from 'lucide-react';
import { toast } from 'sonner';

export function CreateOrgDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    org_name: '', slug: '', owner_email: '',
    tier: 'starter', discount_code: '',
  });
  const [result, setResult] = useState<any>(null);

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('bootstrap-client-org', {
        body: form,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ['admin-all-orgs'] });
      qc.invalidateQueries({ queryKey: ['admin-global-metrics'] });
      toast.success('Organization created');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed'),
  });

  const reset = () => {
    setForm({ org_name: '', slug: '', owner_email: '', tier: 'starter', discount_code: '' });
    setResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> New client organization
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a client organization</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Organization created successfully.</p>
            {result.temp_password && (
              <div className="p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-xs font-semibold mb-1">Temporary password (share securely):</p>
                <code className="text-xs">{result.temp_password}</code>
              </div>
            )}
            {result.magic_link && (
              <div className="p-3 rounded-md bg-muted/50">
                <p className="text-xs font-semibold mb-1">Magic sign-in link:</p>
                <div className="flex items-start gap-2">
                  <code className="text-[10px] break-all flex-1">{result.magic_link}</code>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(result.magic_link);
                      toast.success('Link copied');
                    }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="org_name">Studio / company name</Label>
              <Input
                id="org_name" required
                value={form.org_name}
                onChange={(e) => setForm({ ...form, org_name: e.target.value,
                  slug: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40) })}
                placeholder="Studio Alfa"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug">URL slug</Label>
              <Input
                id="slug" required pattern="[a-z0-9-]+"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="studio-alfa"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="owner_email">Owner email</Label>
              <Input
                id="owner_email" type="email" required
                value={form.owner_email}
                onChange={(e) => setForm({ ...form, owner_email: e.target.value })}
                placeholder="owner@studioalfa.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tier</Label>
                <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter (2 / 2GB)</SelectItem>
                    <SelectItem value="pro">Pro (8 / 10GB)</SelectItem>
                    <SelectItem value="business">Business (unlimited)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="discount_code">Discount code (optional)</Label>
                <Input
                  id="discount_code"
                  value={form.discount_code}
                  onChange={(e) => setForm({ ...form, discount_code: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create organization
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
