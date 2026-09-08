/**
 * StuckItemsPage — organization-level, read-only view of every item that is
 * stuck: pending checkpoints beyond the threshold, open RFI/NCR beyond the
 * threshold, checkpoints closed without the required document, and skips.
 * Visible to admin/coo (super roles) and to project_manager.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserMenu } from '@/components/warroom/UserMenu';
import { useStuckItems, type StuckKind, type StuckRow } from '@/hooks/useStuckItems';

const KIND_META: Record<StuckKind, { label: string; className: string }> = {
  pending: { label: 'Checkpoint fermo', className: 'bg-orange-500/15 text-orange-600 border-orange-500/30' },
  rfi: { label: 'RFI aperta', className: 'bg-sky-500/15 text-sky-600 border-sky-500/30' },
  ncr: { label: 'Non conformità', className: 'bg-destructive/15 text-destructive border-destructive/30' },
  verify: { label: 'Da verificare', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  skip: { label: 'Skip registrato', className: 'bg-violet-500/15 text-violet-600 border-violet-500/30' },
};

export default function StuckItemsPage() {
  const navigate = useNavigate();
  const [threshold, setThreshold] = useState(7);
  const [project, setProject] = useState('all');
  const [kind, setKind] = useState<'all' | StuckKind>('all');
  const { rows, projects, isLoading } = useStuckItems(threshold);

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => (project === 'all' ? true : r.projectId === project))
        .filter((r) => (kind === 'all' ? true : r.kind === kind))
        .sort((a, b) => (b.days ?? 0) - (a.days ?? 0)),
    [rows, project, kind],
  );

  const open = (r: StuckRow) => navigate(`/project/${r.projectId}?item=${r.itemId}`);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> War Room
          </Button>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" /> Item fermi
          </h1>
          <Badge variant="secondary" className="ml-1">{filtered.length}</Badge>
          <div className="ml-auto"><UserMenu /></div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Soglia giorni</Label>
            <Input
              type="number"
              min={0}
              className="h-8 w-24"
              value={threshold}
              onChange={(e) => setThreshold(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Progetto</Label>
            <Select value={project} onValueChange={setProject}>
              <SelectTrigger className="h-8 w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i progetti</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Tabs value={kind} onValueChange={(v) => setKind(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-[11px]">Tutti</TabsTrigger>
              {(Object.keys(KIND_META) as StuckKind[]).map((k) => (
                <TabsTrigger key={k} value={k} className="text-[11px]">{KIND_META[k].label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-10">
            <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10">Nessun item fermo oltre la soglia impostata.</p>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border">
            {filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => open(r)}
                className="w-full text-left flex flex-wrap items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors"
              >
                <Badge variant="outline" className={KIND_META[r.kind].className}>{KIND_META[r.kind].label}</Badge>
                <span className="text-sm font-medium min-w-0 truncate">
                  {r.itemCode ? `${r.itemCode} · ` : ''}{r.itemName}
                </span>
                <span className="text-[11px] text-muted-foreground">{r.projectName}</span>
                <span className="text-xs">{r.label}</span>
                {r.detail && (
                  <span className="text-[11px] text-muted-foreground truncate max-w-[380px]">{r.detail}</span>
                )}
                <span className="ml-auto text-xs font-semibold tabular-nums">
                  {r.days !== null ? `${r.days} gg` : ''}
                </span>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
