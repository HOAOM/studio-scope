/**
 * CheckpointPanel — real checkpoint state of one item.
 * Read-only for everybody except the person who holds, today, the
 * ruolo_responsabile of that checkpoint in the organization.
 * Every write goes to the DB, where the two-level skip rules stay authoritative.
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { FileOrUrlInput } from '@/components/warroom/FileOrUrlInput';
import { useCheckpoints, MACRO_GROUP_LABELS, type CheckpointRow } from '@/hooks/useCheckpoints';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { roleLabel } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  CheckCircle2, Circle, Lock, SkipForward, XCircle, AlertTriangle, Loader2, ShieldCheck,
} from 'lucide-react';

interface CheckpointPanelProps {
  itemId: string;
  projectId: string;
  /** Opens the RFI / NCR section when a blocked badge is clicked. */
  onOpenBlocked?: (section: 'rfi' | 'ncr') => void;
}

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

function StatusBadge({ row, onOpenBlocked }: { row: CheckpointRow; onOpenBlocked?: (s: 'rfi' | 'ncr') => void }) {
  const { status, instance } = row;
  if (status === 'completed') {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/15">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        {row.autoApproved ? 'Auto-approvato — ruoli cumulati' : 'Approvato'}
        {row.completedByName ? ` · ${row.completedByName}` : ''}
        {instance?.completed_at ? ` · ${fmt(instance.completed_at)}` : ''}
      </Badge>
    );
  }
  if (status === 'rejected') {
    return (
      <Badge className="bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/15">
        <XCircle className="w-3 h-3 mr-1" />Rifiutato
      </Badge>
    );
  }
  if (status === 'skipped') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/15">
            <SkipForward className="w-3 h-3 mr-1" />Skippato
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs">
            {row.skippedByName ? `Autorizzato da ${row.skippedByName}` : 'Autorizzato'}
            {instance?.skipped_at ? ` il ${fmt(instance.skipped_at)}` : ''}
          </p>
          <p className="text-xs opacity-80">Motivo: {instance?.skip_reason || '—'}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  if (status === 'blocked') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onOpenBlocked?.(row.blockReason === 'rfi_open' ? 'rfi' : 'ncr')}
            className="focus:outline-none"
          >
            <Badge variant="outline" className="border-orange-500/40 text-orange-600 cursor-pointer hover:bg-orange-500/10">
              <Lock className="w-3 h-3 mr-1" />Bloccato
            </Badge>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {row.blockReason === 'rfi_open'
              ? 'Una richiesta di chiarimento è ancora aperta. Clicca per aprire la sezione RFI.'
              : 'Una non conformità è ancora aperta. Clicca per aprire la sezione NCR.'}
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <Circle className="w-3 h-3 mr-1" />In attesa
    </Badge>
  );
}

export function CheckpointPanel({ itemId, projectId, onOpenBlocked }: CheckpointPanelProps) {
  const { user } = useAuth();
  const { roles } = useUserRole();
  const { data, groups, currentGroup, isLoading, approve, reject, skip } = useCheckpoints(itemId);

  const [docs, setDocs] = useState<Record<string, string | null>>({});
  const [skipTarget, setSkipTarget] = useState<CheckpointRow | null>(null);
  const [skipReason, setSkipReason] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Caricamento checkpoint…
      </div>
    );
  }

  const isExecutor = !!user && data?.itemCreatedBy === user.id;

  const canAct = (row: CheckpointRow) => {
    // SUPER_ROLE: admin and coo bypass the responsible-role gate.
    if (roles.includes('admin') || roles.includes('coo')) return true;
    const need = row.definition.ruolo_responsabile;
    if (!need) return false;
    return roles.includes(need);
  };

  const currentRows = groups.find((g) => g.group === currentGroup)?.rows ?? [];
  const done = currentRows.filter((r) => r.status === 'completed' || r.status === 'skipped').length;

  const handleApprove = async (row: CheckpointRow) => {
    try {
      await approve.mutateAsync({
        definitionId: row.definition.id,
        documentUrl: docs[row.definition.id] ?? null,
        requiresDocument: !!row.definition.richiede_documento,
      });
      toast.success('Checkpoint approvato');
    } catch (e: any) {
      toast.error(e?.message ?? 'Approvazione non riuscita');
    }
  };

  const handleReject = async (row: CheckpointRow) => {
    try {
      await reject.mutateAsync({ definitionId: row.definition.id });
      toast.success('Checkpoint rifiutato');
    } catch (e: any) {
      toast.error(e?.message ?? 'Operazione non riuscita');
    }
  };

  const confirmSkip = async () => {
    if (!skipTarget || !skipReason.trim()) return;
    try {
      await skip.mutateAsync({ definitionId: skipTarget.definition.id, reason: skipReason });
      toast.success('Checkpoint saltato');
      setSkipTarget(null);
      setSkipReason('');
    } catch (e: any) {
      toast.error(e?.message ?? 'Skip non riuscito');
    }
  };

  return (
    <div className="space-y-5">
      {/* Summary counter */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">
          {done} di {currentRows.length} checkpoint completati
        </span>
        <span className="text-xs text-muted-foreground">
          Fase corrente: {MACRO_GROUP_LABELS[currentGroup ?? ''] ?? '—'}
        </span>
        {data?.family && (
          <Badge variant="secondary" className="ml-auto text-[10px]">Famiglia: {data.family}</Badge>
        )}
      </div>

      {groups.map(({ group, rows }) => (
        <div key={group} className="space-y-2">
          <div className="flex items-center gap-2">
            <h4 className={cn(
              'text-[11px] font-semibold uppercase tracking-wider',
              group === currentGroup ? 'text-foreground' : 'text-muted-foreground/60',
            )}>
              {MACRO_GROUP_LABELS[group] ?? group}
            </h4>
            {group === currentGroup && (
              <Badge variant="secondary" className="text-[9px] h-4 px-1.5">In corso</Badge>
            )}
          </div>

          <div className="rounded-lg border border-border divide-y divide-border">
            {rows.map((row) => {
              const d = row.definition;
              const actionable = canAct(row) && (row.status === 'pending' || row.status === 'rejected');
              return (
                <div key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{d.label}</span>
                      {d.tipo === 'automatic' && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1">automatico</Badge>
                      )}
                      {d.ruolo_responsabile && (
                        <span className="text-[10px] text-muted-foreground">
                          {roleLabel(d.ruolo_responsabile)}
                        </span>
                      )}
                      {row.autoApproved && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
                          <AlertTriangle className="w-3 h-3" /> Attenzione separazione dei ruoli
                        </span>
                      )}
                    </div>
                    {d.richiede_documento && row.status === 'completed' && !row.instance?.document_url && (
                      <span className="text-[10px] text-amber-600">Approvato senza documento — da verificare</span>
                    )}
                  </div>

                  <StatusBadge row={row} onOpenBlocked={onOpenBlocked} />

                  {actionable && (
                    <div className="flex items-center gap-2">
                      {d.richiede_documento && (
                        <div className="w-44">
                          <FileOrUrlInput
                            value={docs[d.id] ?? null}
                            onChange={(v) => setDocs((p) => ({ ...p, [d.id]: v }))}
                            storagePath={`${projectId}/${itemId}/checkpoints`}
                            secure
                            placeholder="Documento (facoltativo)"
                          />
                        </div>
                      )}
                      <Button size="sm" className="h-7 text-[11px]" disabled={approve.isPending} onClick={() => handleApprove(row)}>
                        Approva
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px] text-destructive border-destructive/30"
                        disabled={reject.isPending} onClick={() => handleReject(row)}>
                        Rifiuta
                      </Button>
                      {!isExecutor && (
                        <Button size="sm" variant="outline" className="h-7 text-[11px]"
                          onClick={() => { setSkipTarget(row); setSkipReason(''); }}>
                          Salta
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <Dialog open={!!skipTarget} onOpenChange={(o) => !o && setSkipTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salta checkpoint</DialogTitle>
            <DialogDescription>
              {skipTarget?.definition.label} — indica il motivo dello skip. È obbligatorio.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            placeholder="Motivo dello skip…"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipTarget(null)}>Annulla</Button>
            <Button disabled={!skipReason.trim() || skip.isPending} onClick={confirmSkip}>
              Conferma skip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
