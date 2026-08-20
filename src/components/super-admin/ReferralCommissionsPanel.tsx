/**
 * ReferralCommissionsPanel — platform-admin tool for the referral commission
 * system.
 *
 *  - Lists every referral code with its owner organization, the currently
 *    active percentage and the full history of percentage changes.
 *  - Setting a percentage always INSERTS a new row in
 *    referral_commission_rates (history is never overwritten).
 *  - Lists every accrued payout with its status (pending_hold / claimable /
 *    paid), locked price and commission amount.
 *
 * Payout maturity (pending_hold -> claimable after 45 days) is refreshed
 * server-side via the refresh_referral_payout_status() RPC on mount.
 */
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Percent, History } from 'lucide-react';
import { toast } from 'sonner';

interface RateRow {
  id: string;
  referral_code_id: string;
  percentage: number;
  valid_from: string;
  note: string | null;
  created_at: string;
}

interface CodeRow {
  id: string;
  code: string;
  is_active: boolean;
  total_redemptions: number;
  organization_id: string;
  organizations: { name: string } | null;
}

interface PayoutRow {
  id: string;
  payment_id: string | null;
  payment_amount: number;
  locked_price: number;
  commission_percentage: number;
  commission_amount: number;
  status: 'pending_hold' | 'claimable' | 'paid';
  payment_date: string;
  claimable_from: string;
  claimed_at: string | null;
  referred: { name: string } | null;
  referrer: { name: string } | null;
}

const STATUS_LABEL: Record<PayoutRow['status'], string> = {
  pending_hold: 'In attesa',
  claimable: 'Riscuotibile',
  paid: 'Pagato',
};

const STATUS_VARIANT: Record<PayoutRow['status'], 'secondary' | 'default' | 'outline'> = {
  pending_hold: 'secondary',
  claimable: 'default',
  paid: 'outline',
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');
const fmtEur = (n: number | null) =>
  n == null ? '—' : `€${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ReferralCommissionsPanel() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CodeRow | null>(null);
  const [historyOf, setHistoryOf] = useState<CodeRow | null>(null);
  const [pct, setPct] = useState('');
  const [note, setNote] = useState('');

  // Move matured payouts pending_hold -> claimable on load.
  useEffect(() => {
    (supabase as any).rpc('refresh_referral_payout_status').then(() => {
      qc.invalidateQueries({ queryKey: ['referral-payouts'] });
    });
  }, [qc]);

  const { data: codes = [], isLoading: loadingCodes } = useQuery<CodeRow[]>({
    queryKey: ['referral-codes-commission'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('referral_codes')
        .select('id, code, is_active, total_redemptions, organization_id, organizations(name)')
        .order('total_redemptions', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rates = [], isLoading: loadingRates } = useQuery<RateRow[]>({
    queryKey: ['referral-commission-rates'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('referral_commission_rates')
        .select('id, referral_code_id, percentage, valid_from, note, created_at')
        .order('valid_from', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: payouts = [], isLoading: loadingPayouts } = useQuery<PayoutRow[]>({
    queryKey: ['referral-payouts'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('referral_payouts')
        .select(
          'id, payment_id, payment_amount, locked_price, commission_percentage, commission_amount, ' +
          'status, payment_date, claimable_from, claimed_at, ' +
          'referred:referred_org_id(name), referrer:referrer_id(name)',
        )
        .order('payment_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const currentRate = (codeId: string) =>
    rates.find(r => r.referral_code_id === codeId && new Date(r.valid_from) <= new Date());

  const historyFor = (codeId: string) => rates.filter(r => r.referral_code_id === codeId);

  const saveRate = useMutation({
    mutationFn: async () => {
      const value = Number(pct.replace(',', '.'));
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new Error('Percentuale non valida (0-100)');
      }
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from('referral_commission_rates').insert({
        referral_code_id: editing!.id,
        percentage: value,
        note: note.trim() || null,
        set_by: auth.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Nuova percentuale registrata');
      setEditing(null); setPct(''); setNote('');
      qc.invalidateQueries({ queryKey: ['referral-commission-rates'] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Errore nel salvataggio'),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Percent className="w-4 h-4" /> Percentuali commissione
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Ogni modifica crea una nuova riga storica: le percentuali passate non vengono mai sovrascritte.
          </p>
        </CardHeader>
        <CardContent>
          {loadingCodes || loadingRates ? <Loader2 className="w-5 h-5 animate-spin" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codice</TableHead>
                  <TableHead>Proprietario</TableHead>
                  <TableHead className="text-center">Redemptions</TableHead>
                  <TableHead className="text-center">% attuale</TableHead>
                  <TableHead>In vigore dal</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map(c => {
                  const cur = currentRate(c.id);
                  const hist = historyFor(c.id);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.code}</TableCell>
                      <TableCell className="text-sm">{c.organizations?.name ?? '—'}</TableCell>
                      <TableCell className="text-center text-xs">{c.total_redemptions}</TableCell>
                      <TableCell className="text-center">
                        {cur
                          ? <Badge variant="default">{Number(cur.percentage)}%</Badge>
                          : <Badge variant="secondary">non impostata</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {cur ? fmtDate(cur.valid_from) : '—'}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm" variant="outline"
                          onClick={() => { setEditing(c); setPct(cur ? String(cur.percentage) : ''); setNote(''); }}
                        >
                          Imposta %
                        </Button>
                        <Button
                          size="sm" variant="ghost" disabled={hist.length === 0}
                          onClick={() => setHistoryOf(c)}
                        >
                          <History className="w-4 h-4 mr-1" /> {hist.length}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payout referral</CardTitle>
          <p className="text-xs text-muted-foreground">
            Prezzo bloccato = minore tra il prezzo della prima sottoscrizione con quel referral e
            l'importo incassato. Riscuotibile 45 giorni dopo l'incasso.
          </p>
        </CardHeader>
        <CardContent>
          {loadingPayouts ? <Loader2 className="w-5 h-5 animate-spin" /> : payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun payout registrato.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Org segnalata</TableHead>
                  <TableHead>Referrer</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead className="text-right">Incassato</TableHead>
                  <TableHead className="text-right">Prezzo bloccato</TableHead>
                  <TableHead className="text-center">%</TableHead>
                  <TableHead className="text-right">Commissione</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Riscuotibile dal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{p.referred?.name ?? '—'}</TableCell>
                    <TableCell className="text-sm">{p.referrer?.name ?? '—'}</TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {p.payment_id ?? '—'}<br />{fmtDate(p.payment_date)}
                    </TableCell>
                    <TableCell className="text-right text-xs">{fmtEur(p.payment_amount)}</TableCell>
                    <TableCell className="text-right text-xs">{fmtEur(p.locked_price)}</TableCell>
                    <TableCell className="text-center text-xs">{Number(p.commission_percentage)}%</TableCell>
                    <TableCell className="text-right text-xs font-semibold">{fmtEur(p.commission_amount)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(p.claimable_from)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Imposta percentuale — {editing?.code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pct">Percentuale (%)</Label>
              <Input id="pct" value={pct} onChange={e => setPct(e.target.value)} placeholder="es. 10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">Nota (opzionale)</Label>
              <Input id="note" value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Viene creata una nuova riga con decorrenza immediata; la percentuale precedente resta nello storico.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Annulla</Button>
            <Button onClick={() => saveRate.mutate()} disabled={saveRate.isPending}>
              {saveRate.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyOf} onOpenChange={o => !o && setHistoryOf(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Storico percentuali — {historyOf?.code}</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center">%</TableHead>
                <TableHead>In vigore dal</TableHead>
                <TableHead>Nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(historyOf ? historyFor(historyOf.id) : []).map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-center text-xs">{Number(r.percentage)}%</TableCell>
                  <TableCell className="text-xs">{fmtDate(r.valid_from)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.note ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
