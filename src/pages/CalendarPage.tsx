/**
 * CalendarPage — two views:
 *  - "Le mie attività": only the current user's rows, read-only except
 *    requesting leave/permit/sick/training (created with status = requested).
 *  - "Squadra": rows of managed members (can_manage_member decides server-side),
 *    with approve/reject on requested entries and direct entry creation.
 * Project tasks come from v_calendar (source = 'task').
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  addMonths, endOfMonth, endOfWeek, format, isSameMonth, parseISO,
  startOfMonth, startOfWeek, eachDayOfInterval, isWithinInterval,
} from 'date-fns';
import { it } from 'date-fns/locale';
import { ArrowLeft, CalendarDays, Check, ChevronLeft, ChevronRight, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import {
  useCalendarRows, useCreateCalendarEntry, useDecideCalendarEntry, useDeleteCalendarEntry,
  type CalendarRow, type CalendarEntryType,
} from '@/hooks/useCalendar';
import { useOrgDirectory, useOrgPositions, useTeamMembers, useTeams } from '@/hooks/useOrgStructure';

const TYPE_STYLE: Record<string, { label: string; className: string }> = {
  work:     { label: 'Lavoro',   className: 'bg-primary/15 text-primary border-primary/25' },
  task:     { label: 'Task',     className: 'bg-blue-500/15 text-blue-500 border-blue-500/25' },
  leave:    { label: 'Ferie',    className: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25' },
  permit:   { label: 'Permesso', className: 'bg-amber-500/15 text-amber-600 border-amber-500/25' },
  sick:     { label: 'Malattia', className: 'bg-destructive/15 text-destructive border-destructive/25' },
  travel:   { label: 'Trasferta',className: 'bg-purple-500/15 text-purple-500 border-purple-500/25' },
  holiday:  { label: 'Festività',className: 'bg-muted text-muted-foreground border-border' },
  other:    { label: 'Altro',    className: 'bg-muted text-muted-foreground border-border' },
};

const REQUESTABLE: { value: CalendarEntryType; label: string }[] = [
  { value: 'leave', label: 'Ferie' },
  { value: 'permit', label: 'Permesso' },
  { value: 'sick', label: 'Malattia' },
  { value: 'travel', label: 'Formazione / Trasferta' },
];

function typeStyle(row: CalendarRow) {
  if (row.source === 'task') return TYPE_STYLE.task;
  return TYPE_STYLE[row.entry_type] || TYPE_STYLE.other;
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOrgAdmin } = usePermissions();
  const [cursor, setCursor] = useState(() => new Date());
  const [tab, setTab] = useState<'me' | 'team'>('me');
  const [requestOpen, setRequestOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);

  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  const range = { from: format(gridStart, 'yyyy-MM-dd'), to: format(gridEnd, 'yyyy-MM-dd') };

  const { data: rows = [], isLoading } = useCalendarRows(range);
  const { data: directory = [] } = useOrgDirectory();
  const { data: positions = [] } = useOrgPositions();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: teams = [] } = useTeams();
  const decide = useDecideCalendarEntry();
  const removeEntry = useDeleteCalendarEntry();

  const nameOf = (id: string | null) => {
    if (!id) return '—';
    const p = directory.find(d => d.id === id);
    return p?.display_name || p?.email?.split('@')[0] || 'Utente';
  };

  /** users the current user can manage (mirrors can_manage_member) */
  const managedUserIds = useMemo(() => {
    const set = new Set<string>();
    if (isOrgAdmin) { directory.forEach(d => set.add(d.id)); return set; }
    const myPositions = new Set(positions.filter(p => p.user_id === user?.id).map(p => p.id));
    positions.forEach(p => { if (p.manager_id && myPositions.has(p.manager_id) && p.user_id) set.add(p.user_id); });
    const leadTeams = new Set(teamMembers.filter(tm => tm.user_id === user?.id && tm.member_role === 'lead').map(tm => tm.team_id));
    teamMembers.forEach(tm => { if (leadTeams.has(tm.team_id)) set.add(tm.user_id); });
    return set;
  }, [isOrgAdmin, directory, positions, teamMembers, user?.id]);

  const isManager = managedUserIds.size > 0 && (isOrgAdmin || [...managedUserIds].some(id => id !== user?.id));

  const myRows = useMemo(() => rows.filter(r => r.assignee_id === user?.id), [rows, user?.id]);
  const teamRows = useMemo(
    () => rows.filter(r => r.assignee_id && managedUserIds.has(r.assignee_id)),
    [rows, managedUserIds],
  );

  const visibleRows = tab === 'me' ? myRows : teamRows;
  const pending = useMemo(
    () => teamRows.filter(r => r.source === 'entry' && r.status === 'requested'),
    [teamRows],
  );

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const rowsForDay = (day: Date) => visibleRows.filter(r => {
    try {
      return isWithinInterval(day, { start: parseISO(r.start_date), end: parseISO(r.end_date) });
    } catch { return false; }
  });

  const handleDecision = async (id: string, status: 'confirmed' | 'rejected') => {
    try {
      await decide.mutateAsync({ id, status });
      toast.success(status === 'confirmed' ? 'Richiesta approvata' : 'Richiesta rifiutata');
    } catch (e: any) { toast.error(e.message || 'Operazione non riuscita'); }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container flex items-center gap-3 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}><ArrowLeft className="w-5 h-5" /></Button>
          <CalendarDays className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Calendario</h1>
        </div>
      </header>

      <main className="container py-6 space-y-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'me' | 'team')} className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <TabsList className="bg-secondary">
              <TabsTrigger value="me">Le mie attività</TabsTrigger>
              {isManager && (
                <TabsTrigger value="team">
                  Squadra {pending.length > 0 && <span className="ml-1 text-[10px] rounded-full bg-destructive text-destructive-foreground px-1.5">{pending.length}</span>}
                </TabsTrigger>
              )}
            </TabsList>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setCursor(c => addMonths(c, -1))}><ChevronLeft className="w-4 h-4" /></Button>
              <span className="text-sm font-medium min-w-[140px] text-center capitalize">
                {format(cursor, 'MMMM yyyy', { locale: it })}
              </span>
              <Button variant="ghost" size="icon" onClick={() => setCursor(c => addMonths(c, 1))}><ChevronRight className="w-4 h-4" /></Button>
              {tab === 'me' ? (
                <Button size="sm" onClick={() => setRequestOpen(true)}><Plus className="w-4 h-4 mr-1" /> Richiesta</Button>
              ) : (
                <Button size="sm" onClick={() => setEntryOpen(true)}><Plus className="w-4 h-4 mr-1" /> Nuova voce</Button>
              )}
            </div>
          </div>

          <TabsContent value={tab} forceMount>
            {isLoading ? (
              <div className="flex items-center justify-center h-64"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                {tab === 'team' && pending.length > 0 && (
                  <Card className="bg-card border-border mb-4">
                    <CardContent className="pt-4 space-y-2">
                      <h3 className="text-sm font-semibold">Richieste in attesa</h3>
                      {pending.map(r => (
                        <div key={r.id} className="flex items-center gap-2 text-xs border border-border rounded-md px-2 py-1.5">
                          <span className={cn('text-[9px] px-1 py-px rounded border', typeStyle(r).className)}>{typeStyle(r).label}</span>
                          <span className="font-medium">{nameOf(r.assignee_id)}</span>
                          <span className="text-muted-foreground">{r.title}</span>
                          <span className="text-muted-foreground ml-auto font-mono">
                            {format(parseISO(r.start_date), 'dd/MM')} → {format(parseISO(r.end_date), 'dd/MM')}
                          </span>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-emerald-500" onClick={() => handleDecision(r.id, 'confirmed')}>
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-destructive" onClick={() => handleDecision(r.id, 'rejected')}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                <Card className="bg-card border-border">
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-7 gap-px text-[10px] font-medium text-muted-foreground mb-1">
                      {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(d => (
                        <div key={d} className="px-1">{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden">
                      {days.map(day => {
                        const dayRows = rowsForDay(day);
                        return (
                          <div
                            key={day.toISOString()}
                            className={cn(
                              'bg-card min-h-[92px] p-1 space-y-0.5',
                              !isSameMonth(day, cursor) && 'opacity-40',
                            )}
                          >
                            <div className="text-[10px] text-muted-foreground font-mono">{format(day, 'd')}</div>
                            {dayRows.slice(0, 3).map(r => (
                              <div
                                key={`${r.id}-${day.toISOString()}`}
                                className={cn('text-[9px] px-1 py-px rounded border truncate', typeStyle(r).className,
                                  r.status === 'requested' && 'border-dashed',
                                  r.status === 'rejected' && 'line-through opacity-60')}
                                title={`${r.title} — ${nameOf(r.assignee_id)} (${r.status})`}
                              >
                                {tab === 'team' ? `${nameOf(r.assignee_id)}: ` : ''}{r.title}
                              </div>
                            ))}
                            {dayRows.length > 3 && (
                              <div className="text-[9px] text-muted-foreground">+{dayRows.length - 3}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card border-border mt-4">
                  <CardContent className="pt-4 space-y-1">
                    <h3 className="text-sm font-semibold mb-2">Elenco del mese</h3>
                    {visibleRows.length === 0 && <p className="text-xs text-muted-foreground">Nessuna voce nel periodo.</p>}
                    {visibleRows.map(r => (
                      <div key={r.id} className="flex items-center gap-2 text-xs border-b border-border/50 py-1.5">
                        <span className={cn('text-[9px] px-1 py-px rounded border', typeStyle(r).className)}>{typeStyle(r).label}</span>
                        <span className="truncate">{r.title}</span>
                        {tab === 'team' && <span className="text-muted-foreground">· {nameOf(r.assignee_id)}</span>}
                        <span className="text-muted-foreground ml-auto font-mono">
                          {format(parseISO(r.start_date), 'dd/MM')} → {format(parseISO(r.end_date), 'dd/MM')}
                        </span>
                        <span className="text-[9px] text-muted-foreground uppercase w-[70px] text-right">{r.status}</span>
                        {r.source === 'entry' && (r.assignee_id === user?.id ? r.status === 'requested' : isManager) && (
                          <Button
                            size="sm" variant="ghost" className="h-6 px-2 text-destructive"
                            onClick={async () => {
                              try { await removeEntry.mutateAsync(r.id); toast.success('Voce eliminata'); }
                              catch (e: any) { toast.error(e.message || 'Eliminazione non riuscita'); }
                            }}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <EntryDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        mode="request"
        directory={[]}
        teams={[]}
      />
      <EntryDialog
        open={entryOpen}
        onOpenChange={setEntryOpen}
        mode="manage"
        directory={directory.filter(d => managedUserIds.has(d.id))}
        teams={teams.map(t => ({ id: t.id, name: t.name }))}
      />
    </div>
  );
}

function EntryDialog({
  open, onOpenChange, mode, directory, teams,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: 'request' | 'manage';
  directory: { id: string; display_name: string | null; email: string | null }[];
  teams: { id: string; name: string }[];
}) {
  const create = useCreateCalendarEntry();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [type, setType] = useState<CalendarEntryType>(mode === 'request' ? 'leave' : 'work');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [userId, setUserId] = useState('none');
  const [teamId, setTeamId] = useState('none');
  const [notes, setNotes] = useState('');

  const types = mode === 'request'
    ? REQUESTABLE
    : (Object.keys(TYPE_STYLE).filter(k => k !== 'task') as CalendarEntryType[]).map(v => ({ value: v, label: TYPE_STYLE[v].label }));

  const submit = async () => {
    if (!title.trim()) { toast.error('Inserisci un titolo'); return; }
    if (end < start) { toast.error('La data di fine precede quella di inizio'); return; }
    try {
      await create.mutateAsync({
        title: title.trim(),
        entry_type: type,
        start_date: start,
        end_date: end,
        notes: notes.trim() || null,
        status: mode === 'request' ? 'requested' : 'confirmed',
        user_id: mode === 'manage' && userId !== 'none' ? userId : undefined,
        team_id: mode === 'manage' && teamId !== 'none' ? teamId : null,
      });
      toast.success(mode === 'request' ? 'Richiesta inviata' : 'Voce creata');
      onOpenChange(false);
      setTitle(''); setNotes('');
    } catch (e: any) {
      toast.error(e.message || 'Salvataggio non riuscito');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'request' ? 'Nuova richiesta' : 'Nuova voce di calendario'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as CalendarEntryType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {types.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {mode === 'manage' && (
            <>
              <div>
                <Label className="text-xs">Persona</Label>
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Me stesso</SelectItem>
                    {directory.map(d => <SelectItem key={d.id} value={d.id}>{d.display_name || d.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Squadra (opzionale)</Label>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessuna</SelectItem>
                    {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div>
            <Label className="text-xs">Titolo</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Es. Ferie estive" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Dal</Label>
              <Input type="date" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Al</Label>
              <Input type="date" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Note</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button size="sm" onClick={submit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {mode === 'request' ? 'Invia richiesta' : 'Crea'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
