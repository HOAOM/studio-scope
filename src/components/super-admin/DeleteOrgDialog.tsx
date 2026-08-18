/**
 * DeleteOrgDialog — cancellazione definitiva di un'organizzazione cliente,
 * riservata al platform admin. Pattern "type to confirm": occorre ridigitare
 * esattamente il nome dell'organizzazione. Prima della conferma vengono
 * mostrati i conteggi reali dei dati collegati (edge function preview).
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface Counts {
  projects: number;
  items: number;
  members: number;
  invites: number;
  roles: number;
  tasks: number;
  client_boards: number;
  presentations: number;
  milestones: number;
  assignments: number;
}

const LABELS: Record<keyof Counts, string> = {
  projects: 'Progetti',
  items: 'Voci BOQ',
  members: 'Membri',
  invites: 'Inviti',
  roles: 'Ruoli',
  tasks: 'Task',
  client_boards: 'Client board',
  presentations: 'Presentazioni',
  milestones: 'Milestone',
  assignments: 'Assegnazioni',
};

export function DeleteOrgDialog({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['org-delete-preview', orgId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin-delete-organization', {
        body: { action: 'preview', org_id: orgId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { counts: Counts };
    },
  });

  const counts = data?.counts;
  const canConfirm = !!counts && confirmText.trim() === orgName && !deleting;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-delete-organization', {
        body: { action: 'delete', org_id: orgId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Organizzazione "${orgName}" eliminata`);
      setOpen(false);
      setConfirmText('');
      qc.invalidateQueries({ queryKey: ['admin-all-orgs'] });
      qc.invalidateQueries({ queryKey: ['admin-global-metrics'] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Errore durante la cancellazione');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setConfirmText(''); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive">
          <Trash2 className="w-3.5 h-3.5 mr-1" /> Elimina
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Elimina organizzazione</DialogTitle>
          <DialogDescription>
            Operazione irreversibile: tutti i dati collegati a <strong>{orgName}</strong> verranno
            cancellati definitivamente.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : error ? (
          <p className="text-sm text-destructive">{(error as any)?.message ?? 'Errore nel calcolo dei dati collegati'}</p>
        ) : counts ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-1 rounded-md border p-3 text-xs">
              {(Object.keys(LABELS) as (keyof Counts)[]).map((k) => (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{LABELS[k]}</span>
                  <span className="font-mono font-medium">{counts[k]}</span>
                </div>
              ))}
            </div>

            {counts.projects > 0 && (
              <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">
                  Attenzione: questa organizzazione ha <strong>{counts.projects} progetti attivi</strong> con{' '}
                  {counts.items} voci BOQ. Eliminandola perderai definitivamente tutti i dati di progetto,
                  documenti collegati e cronologia.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Per confermare, ridigita esattamente: <span className="font-mono font-medium text-foreground">{orgName}</span>
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={orgName}
                className="h-8 text-xs"
                autoComplete="off"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
              <Button size="sm" variant="destructive" disabled={!canConfirm} onClick={handleDelete}>
                {deleting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
                Elimina definitivamente
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
