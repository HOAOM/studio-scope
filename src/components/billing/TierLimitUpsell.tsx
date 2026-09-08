/**
 * TierLimitUpsell — intercetta l'errore strutturato TIER_LIMIT_REACHED emesso
 * dal database e mostra un modal di upsell al posto di un errore generico.
 * Nessuna logica di limite qui: il blocco resta a database.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TIER_LABEL, type BillingTier } from '@/hooks/useBilling';
import { TIER_LIMIT_EVENT, type TierLimitError } from '@/lib/tierError';

const RESOURCE_LABEL: Record<string, string> = {
  active_projects: 'progetti attivi',
  seats: 'persone nello studio',
  boq_items: 'voci BOQ nel progetto',
  users_per_role: 'persone con lo stesso ruolo',
  roles_per_user: 'ruoli sulla stessa persona',
  super_roles: 'slot admin/coo',
  addons: 'moduli aggiuntivi',
};

const TIER_GAIN: Record<string, string[]> = {
  advanced: ['8 progetti attivi', '10 GB di archivio', '20 persone per ruolo', '1 slot admin/coo extra'],
  pro: ['15 progetti attivi', '20 GB di archivio', 'più ruoli per persona', '3 slot admin/coo extra'],
  enterprise: ['Progetti e archivio senza limiti', 'Ruoli e moduli senza limiti', 'Slot admin/coo senza limiti'],
};

export function TierLimitUpsell() {
  const navigate = useNavigate();
  const [err, setErr] = useState<TierLimitError | null>(null);

  useEffect(() => {
    const handler = (e: Event) => setErr((e as CustomEvent).detail as TierLimitError);
    window.addEventListener(TIER_LIMIT_EVENT, handler);
    return () => window.removeEventListener(TIER_LIMIT_EVENT, handler);
  }, []);

  if (!err) return null;
  const resource = RESOURCE_LABEL[err.resource] ?? err.resource;
  const gains = TIER_GAIN[err.suggested_tier] ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && setErr(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Hai raggiunto un limite del tuo piano
          </DialogTitle>
          <DialogDescription>
            Il piano <strong>{TIER_LABEL[err.current_tier as BillingTier] ?? err.current_tier}</strong> include
            fino a <strong>{err.limit}</strong> {resource}. Ora ne stai usando <strong>{err.current}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Piano consigliato</span>
            <Badge>{TIER_LABEL[err.suggested_tier as BillingTier] ?? err.suggested_tier}</Badge>
          </div>
          {gains.length > 0 && (
            <ul className="text-sm space-y-1 list-disc pl-5 text-muted-foreground">
              {gains.map((g) => <li key={g}>{g}</li>)}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setErr(null)}>Non ora</Button>
          <Button
            onClick={() => { setErr(null); navigate('/billing'); }}
          >
            Passa a {TIER_LABEL[err.suggested_tier as BillingTier] ?? err.suggested_tier}
            <ArrowUpRight className="w-4 h-4 ml-1.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
