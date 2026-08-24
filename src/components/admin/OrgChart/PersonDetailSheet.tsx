/**
 * PersonDetailSheet — pannello di dettaglio al click su una scheda.
 * Contatti + azioni a costo zero + interruttore visibilità costi (owner/admin).
 */
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Building2, Copy, Mail, MessageSquare, Phone, Trash2 } from 'lucide-react';
import type { OrgNode, TodayEntry } from '@/hooks/useOrgChartV3';
import type { DirectoryProfile, Team } from '@/hooks/useOrgStructure';
import type { Contractor } from './ContractorCard';
import { StatusDot } from './PersonCard';

export interface PersonDetailSheetProps {
  node: OrgNode | null;
  profile?: DirectoryProfile & { phone?: string | null };
  supplier?: Contractor;
  teams: Team[];
  primaryTeamId?: string | null;
  today?: TodayEntry;
  canEdit: boolean;
  canManagePermissions: boolean;
  overrideValue: boolean | null;
  onOverrideChange: (value: boolean | null) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function PersonDetailSheet({
  node, profile, supplier, teams, primaryTeamId, today,
  canEdit, canManagePermissions, overrideValue, onOverrideChange, onDelete, onClose,
}: PersonDetailSheetProps) {
  const navigate = useNavigate();
  if (!node) return null;

  const isContractor = node.node_kind === 'contractor';
  const name = isContractor
    ? supplier?.name || node.title
    : profile?.display_name || profile?.email || node.title;
  const email = isContractor ? supplier?.email : profile?.email;
  const phone = isContractor ? supplier?.phone : profile?.phone;

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

          {!isContractor && (
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

          {canManagePermissions && !isContractor && node.user_id && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="cost-visibility" className="text-xs">
                  Può vedere costi, prezzi e margini
                </Label>
                <Switch
                  id="cost-visibility"
                  checked={overrideValue === true}
                  onCheckedChange={(v) => onOverrideChange(v)}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Override individuale sopra il ruolo di default.
                {overrideValue === null
                  ? ' Al momento vale il ruolo assegnato.'
                  : ' Impostazione manuale attiva.'}
              </p>
              {overrideValue !== null && (
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => onOverrideChange(null)}>
                  Torna al valore del ruolo
                </Button>
              )}
            </div>
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
