/**
 * TierLimitsPanel — configurazione dei limiti di piano (tabella public.tier_limits).
 * Scrivibile solo dai platform admin (RLS: is_platform_admin). I valori vuoti
 * significano "illimitato". I limiti sono applicati lato server da trigger e
 * policy di storage, quindi cambiarli qui ha effetto immediato.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

type Row = {
  tier: string;
  max_seats: number | null;
  max_active_projects: number | null;
  max_boq_items_per_project: number | null;
  max_storage_gb: number | null;
};

const GB = 1024 ** 3;

export function TierLimitsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('tier_limits')
      .select('*')
      .order('tier');
    if (error) toast.error(error.message);
    setRows(
      (data ?? []).map((r: any) => ({
        tier: r.tier,
        max_seats: r.max_seats,
        max_active_projects: r.max_active_projects,
        max_boq_items_per_project: r.max_boq_items_per_project,
        max_storage_gb: r.max_storage_bytes == null ? null : Math.round((r.max_storage_bytes / GB) * 100) / 100,
      })),
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setField = (tier: string, field: keyof Row, raw: string) => {
    const value = raw.trim() === '' ? null : Number(raw);
    setRows(prev => prev.map(r => (r.tier === tier ? { ...r, [field]: value } as Row : r)));
  };

  const save = async (row: Row) => {
    setSaving(row.tier);
    const { error } = await (supabase as any)
      .from('tier_limits')
      .update({
        max_seats: row.max_seats,
        max_active_projects: row.max_active_projects,
        max_boq_items_per_project: row.max_boq_items_per_project,
        max_storage_bytes: row.max_storage_gb == null ? null : Math.round(row.max_storage_gb * GB),
        updated_at: new Date().toISOString(),
      })
      .eq('tier', row.tier);
    setSaving(null);
    if (error) toast.error(error.message);
    else toast.success(`Limiti "${row.tier}" aggiornati`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tier limits</CardTitle>
        <p className="text-xs text-muted-foreground">
          Campo vuoto = illimitato. Applicati lato server (posti, progetti attivi, voci BOQ, storage).
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tier</TableHead>
                <TableHead>Posti</TableHead>
                <TableHead>Progetti attivi</TableHead>
                <TableHead>Voci BOQ / progetto</TableHead>
                <TableHead>Storage (GB)</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.tier}>
                  <TableCell className="font-medium capitalize">{row.tier}</TableCell>
                  {(['max_seats', 'max_active_projects', 'max_boq_items_per_project', 'max_storage_gb'] as const).map(f => (
                    <TableCell key={f}>
                      <Input
                        className="h-8 w-28"
                        type="number"
                        min={0}
                        placeholder="∞"
                        value={row[f] ?? ''}
                        onChange={e => setField(row.tier, f, e.target.value)}
                      />
                    </TableCell>
                  ))}
                  <TableCell>
                    <Button size="sm" onClick={() => save(row)} disabled={saving === row.tier}>
                      {saving === row.tier ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Salva'}
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
