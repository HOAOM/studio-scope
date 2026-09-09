/**
 * NewProjectDialog — creazione di un nuovo progetto.
 * Prima si sceglie il percorso: Wizard guidato (3 step) oppure Setup manuale
 * (stessi identici campi, su una schermata sola).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Wand2, ListChecks, Check, Users, Package, IdCard, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CATEGORY_OPTIONS, getCategoryLabel } from '@/lib/categories';
import { useProjects } from '@/hooks/useProjects';
import {
  PROJECT_TYPES, TEMPLATE_CATEGORIES, useOrgPeople, personLabel, suggestProjectCode,
  useCreateProjectSetup, type ProjectType, type QuickItemInput,
} from '@/hooks/useProjectSetup';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Mode = 'choose' | 'wizard' | 'manual';

const STEPS = [
  { key: 'identity', label: 'Identità', icon: IdCard },
  { key: 'people', label: 'Responsabilità', icon: Users },
  { key: 'items', label: 'Item', icon: Package },
  { key: 'summary', label: 'Riepilogo', icon: Check },
] as const;

const todayISO = () => new Date().toISOString().slice(0, 10);
const plusDaysISO = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

export function NewProjectDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { data: projects = [] } = useProjects();
  const { data: people = [] } = useOrgPeople();
  const create = useCreateProjectSetup();

  const [mode, setMode] = useState<Mode>('choose');
  const [step, setStep] = useState(0);

  // Step 1 — identità
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [client, setClient] = useState('');
  const [projectType, setProjectType] = useState<ProjectType | ''>('');
  const [budget, setBudget] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(plusDaysISO(90));

  // Step 2 — responsabilità
  const [pm, setPm] = useState('');
  const [hod, setHod] = useState('');
  const [site, setSite] = useState('');

  // Step 3 — primi item
  const [useTemplate, setUseTemplate] = useState(true);
  const [quickItems, setQuickItems] = useState<QuickItemInput[]>([]);

  useEffect(() => {
    if (!open) return;
    setMode('choose');
    setStep(0);
    setName(''); setCode(''); setCodeTouched(false); setClient('');
    setProjectType(''); setBudget('');
    setStartDate(todayISO()); setEndDate(plusDaysISO(90));
    setPm(''); setHod(''); setSite('');
    setUseTemplate(true); setQuickItems([]);
  }, [open]);

  // Codice suggerito automaticamente, ma modificabile
  useEffect(() => {
    if (codeTouched) return;
    setCode(name.trim() ? suggestProjectCode(name, projects.map((p) => p.code)) : '');
  }, [name, codeTouched, projects]);

  const peopleOptions = useMemo(
    () => [{ value: '', label: '— Non ancora deciso —' }, ...people.map((p) => ({ value: p.id, label: personLabel(p) }))],
    [people]
  );

  const templateCats = projectType ? TEMPLATE_CATEGORIES[projectType] : [];

  const identityValid =
    name.trim() && code.trim() && client.trim() && projectType && startDate && endDate &&
    new Date(endDate) > new Date(startDate);

  const submit = async () => {
    if (!identityValid) { toast.error('Completa i campi obbligatori dello step Identità'); return; }
    try {
      const project = await create.mutateAsync({
        name: name.trim(),
        code: code.trim(),
        client: client.trim(),
        project_type: projectType as ProjectType,
        budget_estimate: budget ? Number(budget) : null,
        start_date: startDate,
        target_completion_date: endDate,
        responsibles: { project_manager: pm || null, head_of_design: hod || null, site_engineer: site || null },
        useTemplate,
        quickItems: quickItems.filter((q) => q.description.trim()),
      });
      toast.success('Progetto creato');
      onOpenChange(false);
      navigate(`/project/${project.id}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Creazione non riuscita');
    }
  };

  /* ---------------- campi riutilizzabili ---------------- */

  const IdentityFields = (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label>Nome progetto *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Villa Serena" autoFocus />
        </div>
        <div>
          <Label>Codice / riferimento *</Label>
          <Input
            value={code}
            onChange={(e) => { setCodeTouched(true); setCode(e.target.value); }}
            placeholder="VIL-2026-001"
          />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label>Cliente *</Label>
          <Input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Nome cliente" />
        </div>
        <div>
          <Label>Budget indicativo</Label>
          <Input type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Opzionale" />
        </div>
      </div>
      <div>
        <Label>Tipo progetto *</Label>
        <div className="grid sm:grid-cols-3 gap-2 mt-1.5">
          {PROJECT_TYPES.map((t) => (
            <Card
              key={t.value}
              onClick={() => setProjectType(t.value)}
              className={cn(
                'p-3 cursor-pointer border-2 transition-all hover:border-primary/50',
                projectType === t.value ? 'border-primary bg-primary/5' : 'border-border'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{t.label}</span>
                {projectType === t.value && <Check className="w-4 h-4 text-primary" />}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
            </Card>
          ))}
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label>Data inizio *</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <Label>Consegna prevista *</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>
    </div>
  );

  const PeopleFields = (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Scegli tra le persone già presenti in azienda. Ogni campo può restare vuoto.
      </p>
      {([
        ['Project Manager', pm, setPm],
        ['Capo progettazione', hod, setHod],
        ['Capocantiere', site, setSite],
      ] as [string, string, (v: string) => void][]).map(([label, value, setter]) => (
        <div key={label}>
          <Label>{label}</Label>
          <SearchableSelect
            value={value}
            onValueChange={setter}
            options={peopleOptions}
            placeholder="Cerca una persona…"
          />
        </div>
      ))}
    </div>
  );

  const ItemsFields = (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-2">
        <Card
          onClick={() => setUseTemplate(true)}
          className={cn('p-3 cursor-pointer border-2 transition-all', useTemplate ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50')}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">Parti da un template</span>
            {useTemplate && <Check className="w-4 h-4 text-primary" />}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Macro-gruppi pre-attivati per il tipo progetto scelto</p>
        </Card>
        <Card
          onClick={() => setUseTemplate(false)}
          className={cn('p-3 cursor-pointer border-2 transition-all', !useTemplate ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50')}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">Parti da zero</span>
            {!useTemplate && <Check className="w-4 h-4 text-primary" />}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Nessun macro-gruppo pre-attivato</p>
        </Card>
      </div>

      {useTemplate && (
        <div className="rounded-md border p-3 bg-muted/30 animate-fade-in">
          <p className="text-xs text-muted-foreground mb-2">
            Verranno pre-attivati questi macro-gruppi ({templateCats.length}):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {templateCats.length === 0 && <span className="text-xs italic">Scegli prima il tipo progetto.</span>}
            {templateCats.map((c) => <Badge key={c} variant="secondary">{getCategoryLabel(c)}</Badge>)}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Primi item (opzionale, max 3)</Label>
          {quickItems.length < 3 && (
            <Button
              type="button" size="sm" variant="outline"
              onClick={() => setQuickItems([...quickItems, { description: '', category: 'joinery', assignee_id: '' }])}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi
            </Button>
          )}
        </div>
        {quickItems.map((qi, i) => (
          <div key={i} className="grid md:grid-cols-[1fr_170px_170px_auto] gap-2 items-center animate-fade-in">
            <Input
              placeholder="Nome item"
              value={qi.description}
              onChange={(e) => setQuickItems(quickItems.map((q, j) => j === i ? { ...q, description: e.target.value } : q))}
            />
            <Select
              value={qi.category}
              onValueChange={(v) => setQuickItems(quickItems.map((q, j) => j === i ? { ...q, category: v } : q))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <SearchableSelect
              value={qi.assignee_id ?? ''}
              onValueChange={(v) => setQuickItems(quickItems.map((q, j) => j === i ? { ...q, assignee_id: v } : q))}
              options={peopleOptions}
              placeholder="Assegnatario"
            />
            <Button type="button" variant="ghost" size="icon" onClick={() => setQuickItems(quickItems.filter((_, j) => j !== i))}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );

  const nameOf = (id: string) => {
    const p = people.find((x) => x.id === id);
    return p ? personLabel(p) : '—';
  };

  const Summary = (
    <div className="space-y-3 text-sm">
      <Card className="p-3 space-y-1">
        <div className="font-semibold">Identità</div>
        <div className="text-muted-foreground">
          {name} · {code} · {client} ·{' '}
          {PROJECT_TYPES.find((t) => t.value === projectType)?.label ?? '—'}
          {budget ? ` · Budget ${Number(budget).toLocaleString('it-IT')}` : ''}
        </div>
        <div className="text-muted-foreground">{startDate} → {endDate}</div>
      </Card>
      <Card className="p-3 space-y-1">
        <div className="font-semibold">Responsabilità</div>
        <div className="text-muted-foreground">PM: {pm ? nameOf(pm) : '—'}</div>
        <div className="text-muted-foreground">Capo progettazione: {hod ? nameOf(hod) : '—'}</div>
        <div className="text-muted-foreground">Capocantiere: {site ? nameOf(site) : '—'}</div>
      </Card>
      <Card className="p-3 space-y-1">
        <div className="font-semibold">Item</div>
        <div className="text-muted-foreground">
          {useTemplate ? `Template: ${templateCats.length} macro-gruppi` : 'Si parte da zero'}
        </div>
        {quickItems.filter((q) => q.description.trim()).map((q, i) => (
          <div key={i} className="text-muted-foreground">
            • {q.description} ({getCategoryLabel(q.category)}){q.assignee_id ? ` — ${nameOf(q.assignee_id)}` : ''}
          </div>
        ))}
      </Card>
    </div>
  );

  /* ---------------- render ---------------- */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle>Nuovo progetto</DialogTitle>
          <DialogDescription>
            {mode === 'choose'
              ? 'Scegli come vuoi procedere.'
              : mode === 'wizard' ? 'Pochi secondi per step, puoi tornare indietro quando vuoi.' : 'Tutti i campi in un’unica schermata.'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'choose' && (
          <div className="grid sm:grid-cols-2 gap-3 animate-fade-in">
            <Card onClick={() => setMode('wizard')} className="p-4 cursor-pointer border-2 border-primary/40 hover:border-primary transition-all">
              <div className="flex items-center gap-2 font-semibold"><Wand2 className="w-4 h-4 text-primary" /> Wizard guidato</div>
              <Badge className="mt-2">Consigliato</Badge>
              <p className="text-xs text-muted-foreground mt-2">Tre passaggi: Identità → Responsabilità → Item.</p>
            </Card>
            <Card onClick={() => setMode('manual')} className="p-4 cursor-pointer border-2 border-border hover:border-primary/50 transition-all">
              <div className="flex items-center gap-2 font-semibold"><ListChecks className="w-4 h-4" /> Setup manuale</div>
              <p className="text-xs text-muted-foreground mt-2">Stessi campi, tutti visibili insieme.</p>
            </Card>
          </div>
        )}

        {mode === 'wizard' && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-2 flex-wrap">
              {STEPS.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => i < step && setStep(i)}
                    className={cn(
                      'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors',
                      i === step ? 'bg-primary text-primary-foreground border-primary'
                        : i < step ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground'
                    )}
                  >
                    <s.icon className="w-3.5 h-3.5" /> {s.label}
                  </button>
                  {i < STEPS.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
                </div>
              ))}
            </div>

            <div key={step} className="animate-fade-in">
              {step === 0 && IdentityFields}
              {step === 1 && PeopleFields}
              {step === 2 && ItemsFields}
              {step === 3 && Summary}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => (step === 0 ? setMode('choose') : setStep(step - 1))} disabled={create.isPending}>
                ← Indietro
              </Button>
              {step < 3 ? (
                <Button onClick={() => setStep(step + 1)} disabled={step === 0 && !identityValid}>Avanti →</Button>
              ) : (
                <Button onClick={submit} disabled={create.isPending}>
                  {create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Crea progetto
                </Button>
              )}
            </div>
          </div>
        )}

        {mode === 'manual' && (
          <div className="space-y-5 animate-fade-in">
            {IdentityFields}
            <div className="border-t pt-4">{PeopleFields}</div>
            <div className="border-t pt-4">{ItemsFields}</div>
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setMode('choose')} disabled={create.isPending}>← Indietro</Button>
              <Button onClick={submit} disabled={!identityValid || create.isPending}>
                {create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Crea progetto
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
