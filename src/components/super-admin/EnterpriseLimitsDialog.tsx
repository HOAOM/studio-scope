/**
 * EnterpriseLimitsDialog — limiti personalizzati per una singola organizzazione
 * Enterprise. Campo vuoto = illimitato per quella metrica.
 * Scrive su public.organization_limit_overrides (solo platform admin via RLS);
 * i valori sono applicati dai trigger di limite tramite get_tier_limits().
 */
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';

const GB = 1024 ** 3;

type Form = {
  max_active_projects: string;
  max_storage_gb: string;
  max_addons: string;
  max_users_per_role: string;
  max_roles_per_user: string;
  max_super_role_extra: string;
};

const EMPTY: Form = {
  max_active_projects: '', max_storage_gb: '', max_addons: '',
  max_users_per_role: '', max_roles_per_user: '', max_super_role_extra: '',
};

const FIELDS: { key: keyof Form; label: string }[] = [
  { key: 'max_active_projects', label: 'Progetti attivi' },
  { key: 'max_storage_gb', label: 'Storage (GB)' },
  { key: 'max_addons', label: 'Addon inclusi' },
  { key: 'max_users_per_role', label: 'Utenti per ruolo' },
  { key: 'max_roles_per_user', label: 'Ruoli cumulabili per utente' },
  { key: 'max_super_role_extra', label: 'Persone extra admin/coo' },
];

const num = (v: string) => (v.trim() === '' ? null : Number(v));

export function EnterpriseLimitsDialog({ orgId, orgName }: { orgId: string; orgName: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const { data, error } = await (supabase as any)
        .from('organization_limit_overrides')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) toast.error(error.message);
      if (data) {
        setForm({
          max_active_projects: data.max_active_projects?.toString() ?? '',
          max_storage_gb: data.max_storage_bytes == null
            ? '' : String(Math.round((data.max_storage_bytes / GB) * 100) / 100),
          max_addons: data.max_addons?.toString() ?? '',
          max_users_per_role: data.max_users_per_role?.toString() ?? '',
          max_roles_per_user: data.max_roles_per_user?.toString() ?? '',
          max_super_role_extra: data.max_super_role_extra?.toString() ?? '',
        });
      } else {
        setForm(EMPTY);
      }
      setLoading(false);
    })();
  }, [open, orgId]);

  const save = async () => {
    setSaving(true);
    const gb = num(form.max_storage_gb);
    const { error } = await (supabase as any)
      .from('organization_limit_overrides')
      .upsert({
        organization_id: orgId,
        max_active_projects: num(form.max_active_projects),
        max_storage_bytes: gb == null ? null : Math.round(gb * GB),
        max_addons: num(form.max_addons),
        max_users_per_role: num(form.max_users_per_role),
        max_roles_per_user: num(form.max_roles_per_user),
        max_super_role_extra: num(form.max_super_role_extra),
      }, { onConflict: 'organization_id' });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['admin-all-orgs'] });
    toast.success('Limiti personalizzati salvati');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 text-xs">
          <SlidersHorizontal className="w-3.5 h-3.5 mr-1" /> Limiti
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Limiti personalizzati — {orgName}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Campo vuoto = illimitato per quella metrica. Valgono solo per le organizzazioni Enterprise.
        </p>
        {loading ? (
          <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.key} className="text-xs">{f.label}</Label>
                <Input
                  id={f.key} type="number" min={0} placeholder="∞"
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Annulla</Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salva limiti
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
