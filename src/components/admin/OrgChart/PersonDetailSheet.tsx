/**
 * PersonDetailSheet — pannello di dettaglio al click su una scheda.
 * Contatti, modifica della posizione (titolo, persona, squadra, responsabile)
 * e interruttori dei permessi granulari (permission_overrides).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { AlertTriangle, Building2, Copy, Mail, MessageSquare, Phone, Save, Trash2 } from 'lucide-react';
import type { OrgNode, TodayEntry, Capability, NodeRoleInfo } from '@/hooks/useOrgChartV3';
import type { DirectoryProfile, Team } from '@/hooks/useOrgStructure';
import { ORG_ROLES, roleLabel } from '@/lib/roles';
import type { Contractor } from './ContractorCard';
import { StatusDot } from './PersonCard';


const NONE = '__none__';

export const CAPABILITY_META: {
  key: Capability; label: string; hint: string; enforced: boolean;
}[] = [
  { key: 'can_see_costs', label: 'Vede i costi', hint: 'Costi di acquisto e costi accessori.', enforced: true },
  { key: 'can_see_prices', label: 'Vede i prezzi di vendita', hint: 'Prezzi verso il cliente.', enforced: false },
  { key: 'can_see_margins', label: 'Vede i margini', hint: 'Marginalità e ricarichi.', enforced: false },
  { key: 'can_edit_items', label: 'Modifica le voci BOQ', hint: 'Creazione e modifica delle voci di progetto.', enforced: false },
  { key: 'can_approve_gates', label: 'Approva i gate', hint: 'Approvazioni di passaggio di fase.', enforced: false },
];

export interface PositionPatch {
  title?: string;
  user_id?: string | null;
  team_id?: string | null;
  manager_id?: string | null;
}

export interface PersonDetailSheetProps {
  node: OrgNode | null;
  profile?: DirectoryProfile & { phone?: string | null };
  supplier?: Contractor;
  teams: Team[];
  primaryTeamId?: string | null;
  today?: TodayEntry;
  canEdit: boolean;
  canManagePermissions: boolean;
  permissions?: Partial<Record<Capability, boolean>>;
  onSetPermission: (capability: Capability, value: boolean | null) => void;
  /** Tutte le squadre dell'organizzazione (per la modifica). */
  allTeams?: Team[];
  /** Tutti i membri dell'organizzazione (per assegnare una persona). */
  allProfiles?: DirectoryProfile[];
  /** Nodi selezionabili come responsabile. */
  parentOptions?: { id: string; label: string }[];
  onSave?: (patch: PositionPatch) => void;
  saving?: boolean;
  onDelete: () => void;
  onClose: () => void;
}

export function PersonDetailSheet({
  node, profile, supplier, teams, primaryTeamId, today,
  canEdit, canManagePermissions, permissions, onSetPermission,
  allTeams = [], allProfiles = [], parentOptions = [], onSave, saving, onDelete, onClose,
}: PersonDetailSheetProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [userId, setUserId] = useState<string>(NONE);
  const [teamId, setTeamId] = useState<string>(NONE);
  const [managerId, setManagerId] = useState<string>(NONE);

  useEffect(() => {
    if (!node) return;
    setTitle(node.title);
    setUserId(node.user_id || NONE);
    setTeamId(node.team_id || NONE);
    setManagerId(node.manager_id || NONE);
  }, [node?.id, node?.title, node?.user_id, node?.team_id, node?.manager_id]);

  if (!node) return null;

  const isContractor = node.node_kind === 'contractor';
  const name = isContractor
    ? supplier?.name || node.title
    : profile?.display_name || profile?.email || node.title;
  const email = isContractor ? supplier?.email : profile?.email;
  const phone = isContractor ? supplier?.phone : profile?.phone;
  const editable = canEdit && node.can_edit && !!onSave;

  const dirty =
    title !== node.title ||
    (userId === NONE ? null : userId) !== (node.user_id ?? null) ||
    (teamId === NONE ? null : teamId) !== (node.team_id ?? null) ||
    (managerId === NONE ? null : managerId) !== (node.manager_id ?? null);

  const copyContact = async () => {
    await navigator.clipboard.writeText(
      [name, node.title, email, phone].filter(Boolean).join('\n'),
    );
    toast.success('Contatto copiato');
  };

  return (
    <Sheet open={!!node} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {isContractor ? (
              <Building2 className="h-5 w-5" />
            ) : (
              <Avatar className="h-9 w-9">
                <AvatarImage src={profile?.avatar_url || undefined} alt={name} />
                <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
            )}
            <span className="truncate">{name}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="text-sm text-muted-foreground">{node.title}</div>

          {!isContractor && node.node_kind === 'person' && (
            <div className="flex items-center gap-2 text-xs">
              <StatusDot today={today} />
              <span className="text-muted-foreground">
                {today?.status === 'working' && `Al lavoro oggi${today.label ? ` — ${today.label}` : ''}`}
                {today?.status === 'absent' && `Assente oggi${today.label ? ` — ${today.label}` : ''}`}
                {!today && 'Nessun impegno registrato oggi'}
              </span>
            </div>
          )}

          {!isContractor && teams.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {teams.map((t) => (
                <Badge key={t.id} variant={t.id === primaryTeamId ? 'default' : 'secondary'} className="text-[10px]">
                  {t.name}{t.id === primaryTeamId ? ' · primaria' : ''}
                </Badge>
              ))}
            </div>
          )}

          <div className="space-y-1 text-xs">
            {email && <div className="truncate">{email}</div>}
            {phone && <div>{phone}</div>}
            {isContractor && supplier?.contact_person && (
              <div className="text-muted-foreground">Referente: {supplier.contact_person}</div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!phone} asChild={!!phone}>
              {phone ? <a href={`tel:${phone}`}><Phone className="mr-1.5 h-3.5 w-3.5" />Chiama</a> : <span><Phone className="mr-1.5 h-3.5 w-3.5" />Chiama</span>}
            </Button>
            <Button size="sm" variant="outline" disabled={!email} asChild={!!email}>
              {email ? <a href={`mailto:${email}`}><Mail className="mr-1.5 h-3.5 w-3.5" />Email</a> : <span><Mail className="mr-1.5 h-3.5 w-3.5" />Email</span>}
            </Button>
            {!isContractor && node.user_id && (
              <Button size="sm" variant="outline" onClick={() => navigate('/messages')}>
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" />Messaggio
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={copyContact}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />Copia contatto
            </Button>
          </div>

          {editable && (
            <>
              <Separator />
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Modifica posizione
                </h4>

                <div className="space-y-1">
                  <Label className="text-[11px]">Titolo / ruolo</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    data-testid="edit-title"
                    className="h-8 text-xs"
                  />
                </div>

                {!isContractor && (
                  <div className="space-y-1">
                    <Label className="text-[11px]">Persona assegnata</Label>
                    <Select value={userId} onValueChange={setUserId}>
                      <SelectTrigger className="h-8 text-xs" data-testid="edit-person">
                        <SelectValue placeholder="Nessuna persona" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        <SelectItem value={NONE}>Nessuna (posizione vacante)</SelectItem>
                        {allProfiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.display_name || p.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      La foto proviene dal profilo della persona assegnata.
                    </p>
                  </div>
                )}

                {!isContractor && (
                  <div className="space-y-1">
                    <Label className="text-[11px]">Squadra</Label>
                    <Select value={teamId} onValueChange={setTeamId}>
                      <SelectTrigger className="h-8 text-xs" data-testid="edit-team">
                        <SelectValue placeholder="Nessuna squadra" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        <SelectItem value={NONE}>Nessuna squadra</SelectItem>
                        {allTeams.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-[11px]">Responsabile (nodo padre)</Label>
                  <Select value={managerId} onValueChange={setManagerId}>
                    <SelectTrigger className="h-8 text-xs" data-testid="edit-manager">
                      <SelectValue placeholder="Nessuno (radice)" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      <SelectItem value={NONE}>Nessuno — nodo radice</SelectItem>
                      {parentOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  size="sm"
                  disabled={!dirty || saving}
                  data-testid="save-position"
                  onClick={() =>
                    onSave?.({
                      title: title.trim() || node.title,
                      user_id: userId === NONE ? null : userId,
                      team_id: teamId === NONE ? null : teamId,
                      manager_id: managerId === NONE ? null : managerId,
                    })
                  }
                >
                  <Save className="mr-1.5 h-3.5 w-3.5" />Salva modifiche
                </Button>
              </div>
            </>
          )}

          {canManagePermissions && !isContractor && node.user_id && (
            <>
              <Separator />
              <div className="space-y-2 rounded-lg border border-border p-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Permessi individuali
                </h4>
                {CAPABILITY_META.map((cap) => {
                  const value = permissions?.[cap.key];
                  const isSet = value !== undefined;
                  return (
                    <div key={cap.key} className="space-y-1 border-b border-border/60 pb-2 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor={`cap-${cap.key}`} className="text-xs">
                          {cap.label}
                        </Label>
                        <Switch
                          id={`cap-${cap.key}`}
                          data-testid={`cap-${cap.key}`}
                          checked={value === true}
                          onCheckedChange={(v) => onSetPermission(cap.key, v)}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {cap.hint}{' '}
                        {isSet ? 'Impostazione manuale attiva.' : 'Al momento vale il ruolo assegnato.'}
                      </p>
                      {!cap.enforced && (
                        <p className="text-[10px] font-medium text-status-warning">
                          {cap.key === 'can_approve_gates'
                            ? 'Non ancora applicato: l’enforcement arriverà con la ridefinizione degli Approval Gate.'
                            : 'Non ancora applicato lato server: per ora è solo registrato.'}
                        </p>
                      )}
                      {isSet && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px]"
                          onClick={() => onSetPermission(cap.key, null)}
                        >
                          Torna al valore del ruolo
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {canEdit && node.can_edit && (
            <Button size="sm" variant="destructive" onClick={onDelete}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />Rimuovi dall'organigramma
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
