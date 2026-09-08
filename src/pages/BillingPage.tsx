/**
 * BillingPage — "Piano e fatturazione" per l'organizzazione attiva.
 * Mostra dati reali dal database (piano, stato, utilizzo vs limiti), permette
 * l'upgrade diretto e il downgrade con selezione esplicita delle risorse da
 * archiviare. Nessun limite viene calcolato qui: la fonte è il database.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CreditCard, Loader2, AlertTriangle, CheckCircle2, Info, Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { UserMenu } from '@/components/warroom/UserMenu';
import { useUserRole } from '@/hooks/useUserRole';
import { usePermissions } from '@/hooks/usePermissions';
import {
  useOrgUsage, useEntitlement, useRoleUsage, useDowngradePreview, useTierMutations,
  formatBytes, TIER_LABEL, TIER_ORDER, STATUS_LABEL, type BillingTier,
} from '@/hooks/useBilling';
import { roleLabel } from '@/lib/roles';

function UsageRow({
  label, used, limit, format,
}: { label: string; used: number; limit: number | null | undefined; format?: (n: number) => string }) {
  const fmt = format ?? ((n: number) => String(n));
  const unlimited = limit == null;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const tone = unlimited ? 'bg-primary' : pct >= 100 ? 'bg-destructive' : pct >= 80 ? 'bg-amber-500' : 'bg-primary';
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {fmt(used)} / {unlimited ? 'illimitato' : fmt(limit!)}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${unlimited ? 4 : pct}%` }} />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const navigate = useNavigate();
  const { roles, isLoading: rolesLoading } = useUserRole();
  const { isOrgAdmin, isLoading: permLoading } = usePermissions();
  const { data: usage, isLoading: usageLoading } = useOrgUsage();
  const { data: ent } = useEntitlement();
  const { data: roleUsage } = useRoleUsage();
  const { upgrade, downgrade } = useTierMutations();

  const isSuperRole = roles.includes('admin') || roles.includes('coo');
  const canManage = isOrgAdmin || isSuperRole;

  const [target, setTarget] = useState<BillingTier | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const { data: preview, isLoading: previewLoading } = useDowngradePreview(target);

  const tier = (ent?.tier ?? usage?.tier ?? 'basic') as BillingTier;
  const currentIndex = TIER_ORDER.indexOf(tier);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected],
  );
  const mustRelease = preview?.active_projects?.must_release ?? 0;
  const stillToRelease = Math.max(mustRelease - selectedIds.length, 0);
  const otherBlocking =
    (preview?.seats?.must_release ?? 0) > 0 || (preview?.storage?.must_release ?? 0) > 0;

  if (rolesLoading || permLoading || usageLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const doUpgrade = (t: BillingTier) => {
    upgrade.mutate(t, {
      onSuccess: () => toast.success(`Piano aggiornato a ${TIER_LABEL[t]}`),
      onError: (e: any) => toast.error(e?.message ?? 'Cambio piano non riuscito'),
    });
  };

  const confirmDowngrade = () => {
    if (!target) return;
    downgrade.mutate(
      { target, archiveProjectIds: selectedIds },
      {
        onSuccess: () => {
          toast.success(`Piano aggiornato a ${TIER_LABEL[target]}`);
          setTarget(null);
          setSelected({});
        },
        onError: (e: any) => toast.error(e?.message ?? 'Cambio piano non riuscito'),
      },
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-[1200px] mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> War Room
          </Button>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" /> Piano e fatturazione
          </h1>
          <div className="ml-auto"><UserMenu /></div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 py-6 space-y-6">
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
          <span>
            Configurazione pagamenti in corso: i cambi di piano richiesti qui sono registrati
            subito, l'addebito automatico si attiverà quando le credenziali di pagamento saranno inserite.
          </span>
        </div>

        {/* Piano attuale */}
        <section className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">Piano attuale</span>
            <Badge className="text-sm">{TIER_LABEL[tier]}</Badge>
            <Badge variant="secondary">{STATUS_LABEL[ent?.status ?? ''] ?? ent?.status ?? '—'}</Badge>
            {ent?.trial_ends_at && (
              <span className="text-xs text-muted-foreground">
                Prova fino al {new Date(ent.trial_ends_at).toLocaleDateString('it-IT')}
              </span>
            )}
            {ent?.current_period_end && (
              <span className="text-xs text-muted-foreground">
                Rinnovo il {new Date(ent.current_period_end).toLocaleDateString('it-IT')}
              </span>
            )}
          </div>
        </section>

        {/* Utilizzo */}
        <section className="rounded-lg border border-border p-4 space-y-4">
          <h2 className="text-sm font-semibold">Utilizzo rispetto ai limiti del piano</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <UsageRow label="Progetti attivi" used={usage?.projects_used ?? 0} limit={usage?.max_active_projects} />
            <UsageRow
              label="Archivio"
              used={usage?.storage_used_bytes ?? 0}
              limit={usage?.max_storage_bytes}
              format={(n) => formatBytes(n)}
            />
            <UsageRow label="Persone nello studio" used={usage?.seats_used ?? 0} limit={usage?.max_seats} />
            <UsageRow
              label="Slot admin/coo extra"
              used={usage?.super_roles_used ?? 0}
              limit={usage?.max_super_role_extra}
            />
            <UsageRow
              label="Ruoli cumulati sulla stessa persona"
              used={roleUsage?.maxRolesPerUser ?? 0}
              limit={usage?.max_roles_per_user}
            />
            <UsageRow label="Moduli aggiuntivi disponibili" used={0} limit={usage?.max_addons} />
          </div>

          <Separator />
          <h3 className="text-sm font-semibold">Persone per ruolo</h3>
          {roleUsage && roleUsage.perRole.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {roleUsage.perRole.map((r) => (
                <UsageRow
                  key={r.role}
                  label={roleLabel(r.role)}
                  used={r.count}
                  limit={usage?.max_users_per_role}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nessun ruolo assegnato.</p>
          )}
        </section>

        {/* Cambio piano */}
        <section className="rounded-lg border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold">Cambia piano</h2>
          {!canManage && (
            <p className="text-sm text-muted-foreground">
              Solo il titolare o un amministratore dello studio può cambiare piano.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TIER_ORDER.map((t, i) => {
              const isCurrent = t === tier;
              const isUpgrade = i > currentIndex;
              return (
                <div key={t} className={`rounded-lg border p-3 space-y-2 ${isCurrent ? 'border-primary' : 'border-border'}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{TIER_LABEL[t]}</span>
                    {isCurrent && <CheckCircle2 className="w-4 h-4 text-primary" />}
                  </div>
                  <Button
                    size="sm"
                    variant={isUpgrade ? 'default' : 'outline'}
                    className="w-full"
                    disabled={!canManage || isCurrent || upgrade.isPending}
                    onClick={() => (isUpgrade ? doUpgrade(t) : (setSelected({}), setTarget(t)))}
                  >
                    {isCurrent ? 'Piano attuale' : isUpgrade ? `Passa a ${TIER_LABEL[t]}` : `Scendi a ${TIER_LABEL[t]}`}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Impostazioni pagamento */}
        {(isOrgAdmin || isSuperRole) && (
          <section className="rounded-lg border border-border p-4 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Lock className="w-4 h-4 text-muted-foreground" /> Impostazioni pagamento
            </h2>
            <p className="text-sm text-muted-foreground">
              Configurazione pagamenti in corso. Questi campi restano vuoti finché le credenziali non vengono inserite.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {['Chiave webhook', 'Chiave API', 'Codici prodotto'].map((l) => (
                <div key={l} className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">{l}</Label>
                  <Input placeholder="Da configurare" disabled />
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Downgrade con selezione esplicita */}
      <Dialog open={!!target} onOpenChange={(o) => { if (!o) { setTarget(null); setSelected({}); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Passaggio al piano {target ? TIER_LABEL[target] : ''}</DialogTitle>
            <DialogDescription>
              Nessun progetto viene chiuso automaticamente: scegli tu quali archiviare.
            </DialogDescription>
          </DialogHeader>

          {previewLoading ? (
            <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : preview && (preview.blocking || mustRelease > 0) ? (
            <div className="space-y-3">
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
                <span>
                  Hai {preview.active_projects.current} progetti attivi, il piano{' '}
                  {target ? TIER_LABEL[target] : ''} ne consente {preview.active_projects.limit ?? '—'}.
                  Devi archiviarne <strong>{mustRelease}</strong>.
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                {preview.active_projects.candidates.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={!!selected[p.id]}
                      onCheckedChange={(v) => setSelected((s) => ({ ...s, [p.id]: !!v }))}
                    />
                    <span className="font-medium">{p.code ?? '—'}</span>
                    <span className="text-muted-foreground truncate">{p.name}</span>
                  </label>
                ))}
              </div>

              <p className="text-sm">
                Selezionati <strong>{selectedIds.length}</strong> di {mustRelease}.{' '}
                {stillToRelease > 0
                  ? <span className="text-destructive">Ne mancano {stillToRelease}.</span>
                  : <span className="text-emerald-500">Puoi confermare.</span>}
              </p>

              {otherBlocking && (
                <p className="text-sm text-destructive">
                  Anche persone o archivio superano i limiti del piano di destinazione: riducili prima di procedere.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Le risorse attuali rientrano nei limiti del piano di destinazione.
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setTarget(null); setSelected({}); }}>Annulla</Button>
            <Button
              disabled={downgrade.isPending || stillToRelease > 0 || otherBlocking}
              onClick={confirmDowngrade}
            >
              {downgrade.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Conferma e archivia {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
