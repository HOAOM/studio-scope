/**
 * ItemGatesPanel — real UI for RFI, Submittal, NCR and Change Requests.
 * The blocking/unblocking logic stays in the database; this only writes rows.
 */
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileOrUrlInput } from '@/components/warroom/FileOrUrlInput';
import { useItemGates, useGatePermissions } from '@/hooks/useItemGates';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { HelpCircle, FileStack, AlertOctagon, GitPullRequest, Loader2 } from 'lucide-react';

export type GateSection = 'rfi' | 'submittal' | 'ncr' | 'change';

interface Props {
  itemId: string;
  projectId: string;
  isCustom?: boolean | null;
  section?: GateSection;
}

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

const statusTone: Record<string, string> = {
  open: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  closed: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  answered: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  rework: 'bg-destructive/15 text-destructive border-destructive/30',
  rejected: 'bg-destructive/15 text-destructive border-destructive/30',
  approved: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  incorporated: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
};

const Tone = ({ status }: { status: string }) => (
  <Badge variant="outline" className={cn('text-[10px]', statusTone[status] ?? 'text-muted-foreground')}>
    {status}
  </Badge>
);

export function ItemGatesPanel({ itemId, projectId, isCustom, section }: Props) {
  const g = useItemGates(itemId);
  const { can } = useGatePermissions();
  const [tab, setTab] = useState<GateSection>(section ?? 'rfi');
  useEffect(() => { if (section) setTab(section); }, [section]);

  // local form state
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [ncrDesc, setNcrDesc] = useState('');
  const [actions, setActions] = useState<Record<string, string>>({});
  const [subTitle, setSubTitle] = useState('');
  const [subUrl, setSubUrl] = useState<string | null>(null);
  const [changeTitle, setChangeTitle] = useState('');
  const [impacts, setImpacts] = useState<Record<string, { cost: string; days: string }>>({});

  const run = async (p: Promise<unknown>, ok: string) => {
    try { await p; toast.success(ok); } catch (e: any) { toast.error(e?.message ?? 'Operazione non riuscita'); }
  };

  if (g.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
      </div>
    );
  }

  const rfis = g.data?.rfis ?? [];
  const ncrs = g.data?.ncrs ?? [];
  const submittals = g.data?.submittals ?? [];
  const changes = g.data?.changes ?? [];
  const openRfis = rfis.filter((r) => r.status !== 'closed').length;
  const openNcrs = ncrs.filter((n) => n.status !== 'closed').length;

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as GateSection)}>
      <TabsList className="mb-3 flex-wrap">
        <TabsTrigger value="rfi"><HelpCircle className="w-3 h-3 mr-1" />RFI{openRfis ? ` (${openRfis})` : ''}</TabsTrigger>
        {isCustom && <TabsTrigger value="submittal"><FileStack className="w-3 h-3 mr-1" />Submittal</TabsTrigger>}
        <TabsTrigger value="ncr"><AlertOctagon className="w-3 h-3 mr-1" />Non Conformità{openNcrs ? ` (${openNcrs})` : ''}</TabsTrigger>
        <TabsTrigger value="change"><GitPullRequest className="w-3 h-3 mr-1" />Varianti</TabsTrigger>
      </TabsList>

      {/* ---------------- RFI ---------------- */}
      <TabsContent value="rfi" className="space-y-3">
        <div className="flex gap-2">
          <Textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)}
            placeholder="Domanda / richiesta di chiarimento…" className="flex-1" />
          <Button disabled={!question.trim() || g.openRfi.isPending}
            onClick={() => run(g.openRfi.mutateAsync({ question }).then(() => setQuestion('')), 'RFI aperta')}>
            Apri RFI
          </Button>
        </div>
        {rfis.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nessuna RFI.</p>}
        <div className="rounded-lg border border-border divide-y divide-border">
          {rfis.map((r) => (
            <div key={r.id} className="px-3 py-2 space-y-2">
              <div className="flex items-start gap-2">
                <p className="text-sm flex-1">{r.question}</p>
                <Tone status={r.status} />
              </div>
              <p className="text-[10px] text-muted-foreground">Aperta il {fmt(r.opened_at)}</p>
              {r.status === 'closed' ? (
                <p className="text-xs text-muted-foreground">Risposta: {r.answer || '—'} · {fmt(r.closed_at)}</p>
              ) : can('rfi') ? (
                <div className="flex gap-2">
                  <Input value={answers[r.id] ?? ''} onChange={(e) => setAnswers((p) => ({ ...p, [r.id]: e.target.value }))}
                    placeholder="Risposta…" className="h-8 text-xs" />
                  <Button size="sm" className="h-8 text-[11px]" disabled={!answers[r.id]?.trim() || g.answerRfi.isPending}
                    onClick={() => run(g.answerRfi.mutateAsync({ id: r.id, answer: answers[r.id] }), 'RFI chiusa')}>
                    Rispondi e chiudi
                  </Button>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">In attesa di risposta dal responsabile.</p>
              )}
            </div>
          ))}
        </div>
      </TabsContent>

      {/* ---------------- SUBMITTAL ---------------- */}
      {isCustom && (
        <TabsContent value="submittal" className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Input value={subTitle} onChange={(e) => setSubTitle(e.target.value)}
              placeholder="Titolo submittal…" className="h-9 flex-1 min-w-48" />
            <div className="w-56">
              <FileOrUrlInput value={subUrl} onChange={setSubUrl}
                storagePath={`${projectId}/${itemId}/submittals`} secure placeholder="Documento versione" />
            </div>
            <Button disabled={!subTitle.trim() || g.addSubmittal.isPending}
              onClick={() => run(g.addSubmittal.mutateAsync({ title: subTitle, documentUrl: subUrl })
                .then(() => { setSubTitle(''); setSubUrl(null); }), 'Versione caricata')}>
              Nuova versione
            </Button>
          </div>
          {submittals.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nessun submittal.</p>}
          <div className="rounded-lg border border-border divide-y divide-border">
            {submittals.map((s) => (
              <div key={s.id} className="px-3 py-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">v{s.version}</Badge>
                <span className="text-sm font-medium flex-1 min-w-32">{s.title}</span>
                <Tone status={s.status} />
                <span className="text-[10px] text-muted-foreground">{fmt(s.submitted_at)}</span>
                {can('submittal') && s.status !== 'approved' && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-[11px]"
                      onClick={() => run(g.reviewSubmittal.mutateAsync({ id: s.id, status: 'under_review' }), 'In revisione')}>
                      In revisione
                    </Button>
                    <Button size="sm" className="h-7 text-[11px]"
                      onClick={() => run(g.reviewSubmittal.mutateAsync({ id: s.id, status: 'approved' }), 'Approvato')}>
                      Approva
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-[11px] text-destructive border-destructive/30"
                      onClick={() => run(g.reviewSubmittal.mutateAsync({ id: s.id, status: 'rework' }), 'Da rifare')}>
                      Da rifare
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>
      )}

      {/* ---------------- NCR ---------------- */}
      <TabsContent value="ncr" className="space-y-3">
        <div className="flex gap-2">
          <Textarea rows={2} value={ncrDesc} onChange={(e) => setNcrDesc(e.target.value)}
            placeholder="Descrizione della non conformità…" className="flex-1" />
          <Button disabled={!ncrDesc.trim() || g.openNcr.isPending}
            onClick={() => run(g.openNcr.mutateAsync({ description: ncrDesc }).then(() => setNcrDesc('')), 'NCR aperta')}>
            Apri NCR
          </Button>
        </div>
        {ncrs.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nessuna non conformità.</p>}
        <div className="rounded-lg border border-border divide-y divide-border">
          {ncrs.map((n) => (
            <div key={n.id} className="px-3 py-2 space-y-2">
              <div className="flex items-start gap-2">
                <p className="text-sm flex-1">{n.description}</p>
                <Tone status={n.status} />
              </div>
              <p className="text-[10px] text-muted-foreground">Aperta il {fmt(n.opened_at)}</p>
              {n.status === 'closed' ? (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground flex-1">
                    Azione correttiva: {n.corrective_action || '—'} · chiusa il {fmt(n.closed_at)}
                  </p>
                  {can('ncr') && (
                    <Button size="sm" variant="outline" className="h-7 text-[11px]"
                      onClick={() => run(g.reopenNcr.mutateAsync({ id: n.id }), 'NCR riaperta')}>
                      Riapri
                    </Button>
                  )}
                </div>
              ) : can('ncr') ? (
                <div className="flex gap-2">
                  <Input value={actions[n.id] ?? ''} onChange={(e) => setActions((p) => ({ ...p, [n.id]: e.target.value }))}
                    placeholder="Azione correttiva…" className="h-8 text-xs" />
                  <Button size="sm" className="h-8 text-[11px]" disabled={!actions[n.id]?.trim() || g.closeNcr.isPending}
                    onClick={() => run(g.closeNcr.mutateAsync({ id: n.id, correctiveAction: actions[n.id] }), 'NCR chiusa')}>
                    Chiudi NCR
                  </Button>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">In attesa del responsabile di cantiere.</p>
              )}
            </div>
          ))}
        </div>
      </TabsContent>

      {/* ---------------- CHANGE REQUESTS ---------------- */}
      <TabsContent value="change" className="space-y-3">
        <div className="flex gap-2">
          <Textarea rows={2} value={changeTitle} onChange={(e) => setChangeTitle(e.target.value)}
            placeholder="Descrizione della variante…" className="flex-1" />
          <Button disabled={!changeTitle.trim() || g.requestChange.isPending}
            onClick={() => run(g.requestChange.mutateAsync({ title: changeTitle, description: '' })
              .then(() => setChangeTitle('')), 'Variante richiesta')}>
            Richiedi variante
          </Button>
        </div>
        {changes.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nessuna variante.</p>}
        <div className="rounded-lg border border-border divide-y divide-border">
          {changes.map((c) => {
            const imp = impacts[c.id] ?? {
              cost: c.cost_impact != null ? String(c.cost_impact) : '',
              days: c.time_impact_days != null ? String(c.time_impact_days) : '',
            };
            const closed = c.status === 'incorporated' || c.status === 'rejected';
            return (
              <div key={c.id} className="px-3 py-2 space-y-2">
                <div className="flex items-start gap-2">
                  <p className="text-sm flex-1">{c.title}</p>
                  <Tone status={c.status} />
                </div>
                {closed ? (
                  <p className="text-[10px] text-muted-foreground">
                    Costo {c.cost_impact ?? '—'} · Giorni {c.time_impact_days ?? '—'} · {fmt(c.approved_at)}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2 items-center">
                    <Input type="number" value={imp.cost} placeholder="Impatto costo"
                      className="h-8 text-xs w-32"
                      onChange={(e) => setImpacts((p) => ({ ...p, [c.id]: { ...imp, cost: e.target.value } }))} />
                    <Input type="number" value={imp.days} placeholder="Giorni"
                      className="h-8 text-xs w-24"
                      onChange={(e) => setImpacts((p) => ({ ...p, [c.id]: { ...imp, days: e.target.value } }))} />
                    <Button size="sm" variant="outline" className="h-8 text-[11px]"
                      onClick={() => run(g.setChangeImpact.mutateAsync({
                        id: c.id,
                        costImpact: imp.cost === '' ? null : Number(imp.cost),
                        timeImpactDays: imp.days === '' ? null : Number(imp.days),
                      }), 'Impatto salvato')}>
                      Salva impatto
                    </Button>
                    {can('change') && (
                      <>
                        <Button size="sm" className="h-8 text-[11px]"
                          onClick={() => run(g.approveChange.mutateAsync({ id: c.id }), 'Variante incorporata')}>
                          Approva variante
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-[11px] text-destructive border-destructive/30"
                          onClick={() => run(g.rejectChange.mutateAsync({ id: c.id }), 'Variante rifiutata')}>
                          Rifiuta
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </TabsContent>
    </Tabs>
  );
}
