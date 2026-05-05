import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuditLog, useAuditLogActions, useAuditLogUsers, AuditLogRow } from '@/hooks/useAuditLog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

function actionBadgeClass(action: string): string {
  const a = action.toLowerCase();
  if (a.includes('insert') || a.includes('create')) return 'bg-green-600 hover:bg-green-600';
  if (a.includes('delete') || a.includes('reject')) return 'bg-red-600 hover:bg-red-600';
  if (a.includes('update') || a.includes('status') || a.includes('approve') || a.includes('revision')) return 'bg-blue-600 hover:bg-blue-600';
  return 'bg-muted-foreground hover:bg-muted-foreground';
}

export function AuditLogPanel() {
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [userId, setUserId] = useState<string>('all');
  const [action, setAction] = useState<string>('all');
  const [detail, setDetail] = useState<AuditLogRow | null>(null);

  const { data, isLoading } = useAuditLog({
    page,
    dateFrom: dateFrom?.toISOString(),
    dateTo: dateTo ? new Date(dateTo.getTime() + 86400000 - 1).toISOString() : undefined,
    userId,
    action,
  });
  const { data: actions = [] } = useAuditLogActions();
  const { data: users = [] } = useAuditLogUsers();

  const resetPage = () => setPage(1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end p-4 bg-card border border-border rounded-lg">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Da</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('w-[180px] justify-start text-left font-normal', !dateFrom && 'text-muted-foreground')}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : <span>Seleziona</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d); resetPage(); }} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">A</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('w-[180px] justify-start text-left font-normal', !dateTo && 'text-muted-foreground')}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateTo ? format(dateTo, 'dd/MM/yyyy') : <span>Seleziona</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d); resetPage(); }} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Utente</Label>
          <Select value={userId} onValueChange={(v) => { setUserId(v); resetPage(); }}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli utenti</SelectItem>
              {users.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.display_name || u.email || u.id.slice(0, 8)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Azione</Label>
          <Select value={action} onValueChange={(v) => { setAction(v); resetPage(); }}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte</SelectItem>
              {actions.map(a => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="ghost" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setUserId('all'); setAction('all'); resetPage(); }}>
          Reset
        </Button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Ora</TableHead>
              <TableHead>Utente</TableHead>
              <TableHead>Azione</TableHead>
              <TableHead>Tabella</TableHead>
              <TableHead>ID Record</TableHead>
              <TableHead>Riepilogo</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Caricamento...</TableCell></TableRow>
            ) : !data?.rows.length ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nessuna attività registrata</TableCell></TableRow>
            ) : data.rows.map(row => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{format(new Date(row.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                <TableCell>{row.user_display_name || row.user_email || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell><Badge className={cn('text-white', actionBadgeClass(row.action))}>{row.action}</Badge></TableCell>
                <TableCell className="text-sm">{row.entity_type}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{row.entity_id?.slice(0, 8)}</TableCell>
                <TableCell className="text-sm max-w-[300px] truncate">{row.summary}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => setDetail(row)}>
                    <Eye className="w-4 h-4 mr-1" /> Dettaglio
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Pagina {data.page} di {data.totalPages} — {data.total} record totali
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Precedente
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page >= data.totalPages}>
              Successiva <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Dettaglio attività</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Data:</span> {format(new Date(detail.created_at), 'dd/MM/yyyy HH:mm:ss')}</div>
                <div><span className="text-muted-foreground">Utente:</span> {detail.user_display_name || detail.user_email || '—'}</div>
                <div><span className="text-muted-foreground">Azione:</span> {detail.action}</div>
                <div><span className="text-muted-foreground">Tabella:</span> {detail.entity_type}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Record ID:</span> <span className="font-mono">{detail.entity_id}</span></div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Dati completi</Label>
                <pre className="mt-1 p-3 bg-muted rounded text-xs overflow-auto max-h-[400px]">{JSON.stringify(detail, null, 2)}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
