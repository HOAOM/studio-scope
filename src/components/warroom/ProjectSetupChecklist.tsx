/**
 * ProjectSetupChecklist — pannello "Primi passi", non bloccante.
 * Compare in cima alla pagina del progetto appena creato; si può chiudere
 * e resta raggiungibile dal link "Configurazione progetto".
 */
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, ChevronDown, ChevronUp, X, Users, Package, FileUp, Loader2, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ORG_ROLES, roleLabel } from '@/lib/roles';
import {
  DOC_CATEGORIES, useOrgPeople, personLabel, useProjectDocuments, useUploadProjectDocument,
  useDeleteProjectDocument, openProjectDocument, useAddProjectMember, useDismissProjectSetup,
} from '@/hooks/useProjectSetup';
import { useProjectMembers } from '@/hooks/useProjectMembers';

interface Props {
  projectId: string;
  hasResponsibles: boolean;
  itemCount: number;
  /** apre la normale interfaccia di creazione item di questo progetto */
  onAddItems: () => void;
  /** true quando aperto dal link "Configurazione progetto" */
  forceOpen?: boolean;
  onClose?: () => void;
}

export function ProjectSetupChecklist({
  projectId, hasResponsibles, itemCount, onAddItems, forceOpen, onClose,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);

  const { data: people = [] } = useOrgPeople();
  const { data: members = [] } = useProjectMembers(projectId);
  const { data: docs = [] } = useProjectDocuments(projectId);
  const dismiss = useDismissProjectSetup(projectId);
  const addMember = useAddProjectMember(projectId);
  const upload = useUploadProjectDocument(projectId);
  const removeDoc = useDeleteProjectDocument(projectId);

  const [personId, setPersonId] = useState('');
  const [fnRole, setFnRole] = useState('designer');
  const [teamNote, setTeamNote] = useState('');
  const [docCategory, setDocCategory] = useState('contract');

  const steps = [
    { key: 'resp', label: 'Responsabili assegnati', done: hasResponsibles, icon: Users, action: () => setMemberOpen(true), cta: 'Gestisci' },
    { key: 'members', label: 'Aggiungi altri membri al progetto', done: members.length > 1, icon: Users, action: () => setMemberOpen(true), cta: 'Aggiungi membro' },
    { key: 'items', label: 'Aggiungi i primi item', done: itemCount > 0, icon: Package, action: onAddItems, cta: 'Vai agli item' },
    { key: 'docs', label: 'Carica documenti iniziali', done: docs.length > 0, icon: FileUp, action: () => setDocOpen(true), cta: 'Carica' },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const handleAddMember = async () => {
    if (!personId) { toast.error('Scegli una persona'); return; }
    try {
      await addMember.mutateAsync({ userId: personId, functionRole: fnRole, teamNote: teamNote || null });
      toast.success('Membro aggiunto al progetto');
      setPersonId(''); setTeamNote('');
    } catch (e: any) { toast.error(e?.message ?? 'Operazione non riuscita'); }
  };

  const handleUpload = async (file: File) => {
    try {
      await upload.mutateAsync({ file, category: docCategory });
      toast.success('Documento caricato');
    } catch (e: any) { toast.error(e?.message ?? 'Upload non riuscito'); }
  };

  return (
    <>
      <Card className="p-4 mb-4 border-primary/30 animate-fade-in">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Primi passi</span>
            <Badge variant="secondary">{doneCount}/{steps.length}</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} aria-label="Comprimi">
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost" size="icon" aria-label="Chiudi"
              onClick={() => (forceOpen ? onClose?.() : dismiss.mutate())}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {!collapsed && (
          <div className="grid md:grid-cols-2 gap-2 mt-3">
            {steps.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2 rounded-md border p-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center shrink-0',
                    s.done ? 'bg-primary text-primary-foreground' : 'border border-border'
                  )}>
                    {s.done ? <Check className="w-3 h-3" /> : <s.icon className="w-3 h-3 text-muted-foreground" />}
                  </span>
                  <span className={cn('text-sm truncate', s.done && 'text-muted-foreground')}>{s.label}</span>
                </div>
                <Button size="sm" variant="outline" onClick={s.action}>{s.cta}</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Membri */}
      <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader><DialogTitle>Aggiungi membri al progetto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Persona (già presente in azienda)</Label>
              <SearchableSelect
                value={personId}
                onValueChange={setPersonId}
                options={people.map((p) => ({ value: p.id, label: personLabel(p) }))}
                placeholder="Cerca una persona…"
              />
            </div>
            <div>
              <Label>Funzione sul progetto</Label>
              <Select value={fnRole} onValueChange={setFnRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORG_ROLES.map((r) => <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gruppo / reparto di riferimento (opzionale)</Label>
              <Input value={teamNote} onChange={(e) => setTeamNote(e.target.value)} placeholder="Es. Design, Cantiere…" />
            </div>
            <Button onClick={handleAddMember} disabled={addMember.isPending} className="w-full">
              {addMember.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Aggiungi al progetto
            </Button>
            <div className="text-xs text-muted-foreground">
              Membri attuali: {members.length}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Documenti */}
      <Dialog open={docOpen} onOpenChange={setDocOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader><DialogTitle>Documenti iniziali</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Categoria</Label>
                <Select value={docCategory} onValueChange={setDocCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>File</Label>
                <Input
                  type="file"
                  disabled={upload.isPending}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              I documenti restano archiviati e collegati al progetto: non modificano budget o altri campi.
            </p>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {docs.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{d.file_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {DOC_CATEGORIES.find((c) => c.value === d.category)?.label ?? d.category}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openProjectDocument(d.file_path).catch(() => toast.error('Apertura non riuscita'))}>
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => removeDoc.mutate({ id: d.id, file_path: d.file_path })}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {docs.length === 0 && <p className="text-xs text-muted-foreground">Nessun documento caricato.</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
