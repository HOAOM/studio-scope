import { useState } from 'react';
import { Bug, Loader2, Send } from 'lucide-react';
import { useLocation, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

type Severity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Floating bug-report button (visible in alto a destra fissa).
 * Disponibile a tutti gli utenti autenticati durante la fase di test interno.
 */
export function BugReportButton() {
  const { user } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const params = useParams();

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');

  if (!user) return null;

  const reset = () => {
    setTitle('');
    setDescription('');
    setSeverity('medium');
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: 'Titolo obbligatorio', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('bug_reports').insert({
      user_id: user.id,
      title: title.trim(),
      description: description.trim() || null,
      severity,
      route: location.pathname + location.search,
      project_id: (params as any).projectId ?? null,
      user_agent: navigator.userAgent,
    });
    setSubmitting(false);

    if (error) {
      toast({
        title: 'Errore invio',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Segnalazione inviata',
      description: 'Grazie! Sarà esaminata al più presto.',
    });
    reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="fixed bottom-4 right-4 z-[60] shadow-lg gap-2 border-destructive/40 hover:border-destructive hover:bg-destructive/10"
          aria-label="Segnala un bug"
        >
          <Bug className="h-4 w-4 text-destructive" />
          <span className="hidden sm:inline">Segnala bug</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Segnala un problema</DialogTitle>
          <DialogDescription>
            Pagina corrente: <code className="text-xs">{location.pathname}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="bug-title">Titolo *</Label>
            <Input
              id="bug-title"
              placeholder="Es. Il salvataggio del BOQ non funziona"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bug-severity">Gravità</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
              <SelectTrigger id="bug-severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Bassa — fastidio minore</SelectItem>
                <SelectItem value="medium">Media — limita una funzione</SelectItem>
                <SelectItem value="high">Alta — blocca un flusso</SelectItem>
                <SelectItem value="critical">Critica — perdita dati / crash</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bug-description">Descrizione</Label>
            <Textarea
              id="bug-description"
              placeholder="Cosa stavi facendo? Cosa ti aspettavi? Cosa è successo?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={2000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="ml-2">Invia</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
