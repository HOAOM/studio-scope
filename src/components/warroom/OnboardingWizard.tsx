import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, FileText, Users, Rocket, Check, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  settingsId: string | null;
}

const TEMPLATES = [
  { id: 'classic', name: 'Classic', desc: 'Layout professionale classico, colori neutri' },
  { id: 'modern', name: 'Modern', desc: 'Design moderno con accenti colore' },
  { id: 'minimal', name: 'Minimal', desc: 'Essenziale, ottimizzato per stampa' },
];

const TEAM_GROUPS = [
  { name: 'Management', roles: 'CEO, COO, Project Manager' },
  { name: 'Design', roles: 'Head of Design, Designer' },
  { name: 'Operations', roles: 'QS, Procurement' },
  { name: 'Finance', roles: 'Accountant, Head of Payments' },
  { name: 'Site', roles: 'Site Manager' },
];

export function OnboardingWizard({ open, settingsId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [companyName, setCompanyName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [logoBase64, setLogoBase64] = useState<string>('');

  // Step 2
  const [template, setTemplate] = useState('classic');

  // Step 3
  const [teamEmails, setTeamEmails] = useState<Record<string, string>>({});

  // Step 4
  const [projectName, setProjectName] = useState('');
  const [projectClient, setProjectClient] = useState('');
  const [projectStart, setProjectStart] = useState('');

  const handleLogo = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setLogoBase64(reader.result as string);
    reader.readAsDataURL(file);
  };

  const saveSettings = async (extra: Record<string, any> = {}) => {
    if (!settingsId) return;
    const payload: any = {
      company_name: companyName,
      company_address: [city, country].filter(Boolean).join(', '),
      contact_email: contactEmail,
      website,
      export_template: template,
      ...extra,
    };
    if (logoBase64) payload.logo_url = logoBase64;
    const { error } = await (supabase as any).from('company_settings').update(payload).eq('id', settingsId);
    if (error) throw error;
  };

  const finish = async (createProject: boolean) => {
    setSaving(true);
    try {
      await saveSettings({ onboarding_completed: true });
      if (createProject && projectName && user) {
        await supabase.from('projects').insert({
          name: projectName,
          client: projectClient || 'TBD',
          code: projectName.substring(0, 6).toUpperCase().replace(/\s/g, ''),
          start_date: projectStart || new Date().toISOString().slice(0, 10),
          target_completion_date: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
          owner_id: user.id,
        } as any);
        toast({ title: 'Progetto creato' });
      }
      await qc.invalidateQueries({ queryKey: ['company_settings'] });
      await qc.invalidateQueries({ queryKey: ['projects'] });
    } catch (e: any) {
      toast({ title: 'Errore', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleNextFromTeam = () => {
    Object.values(teamEmails).filter(Boolean).forEach((email) => {
      toast({ title: 'Invito inviato', description: email });
    });
    setStep(4);
  };

  const progress = (step / 4) * 100;

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto p-0 [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="p-6 border-b">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold">Benvenuto in Studio Scope</h2>
            <span className="text-sm text-muted-foreground">Step {step} di 4</span>
          </div>
          <Progress value={progress} />
        </div>

        <div className="p-6 space-y-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Building2 className="w-5 h-5" /> Il tuo studio
              </div>
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-full bg-muted overflow-hidden flex items-center justify-center border">
                  {logoBase64 ? (
                    <img src={logoBase64} alt="logo" className="w-full h-full object-cover" />
                  ) : (
                    <Upload className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleLogo(e.target.files[0])}
                  className="max-w-xs"
                />
              </div>
              <div>
                <Label>Nome Studio *</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Città</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
                <div><Label>Paese</Label><Input value={country} onChange={(e) => setCountry(e.target.value)} /></div>
              </div>
              <div><Label>Email di contatto</Label><Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} /></div>
              <div><Label>Sito web</Label><Input value={website} onChange={(e) => setWebsite(e.target.value)} /></div>
              <div className="flex justify-between items-center pt-2">
                <button onClick={() => finish(false)} className="text-sm text-muted-foreground underline" disabled={saving}>
                  Salta onboarding
                </button>
                <Button disabled={!companyName.trim()} onClick={() => setStep(2)}>Avanti →</Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <FileText className="w-5 h-5" /> Template documenti
              </div>
              <div className="grid grid-cols-3 gap-3">
                {TEMPLATES.map((t) => (
                  <Card
                    key={t.id}
                    onClick={() => setTemplate(t.id)}
                    className={cn(
                      'p-4 cursor-pointer border-2 transition-all',
                      template === t.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold">{t.name}</span>
                      {template === t.id && <Check className="w-4 h-4 text-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{t.desc}</p>
                  </Card>
                ))}
              </div>
              <div className="flex justify-between items-center pt-2">
                <button onClick={() => finish(false)} className="text-sm text-muted-foreground underline" disabled={saving}>
                  Salta onboarding
                </button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)}>← Indietro</Button>
                  <Button onClick={() => setStep(3)}>Avanti →</Button>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Users className="w-5 h-5" /> Il tuo team
              </div>
              <div className="space-y-3">
                {TEAM_GROUPS.map((g) => (
                  <Card key={g.name} className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-medium">{g.name}</div>
                        <div className="text-xs text-muted-foreground">{g.roles}</div>
                      </div>
                      <Input
                        type="email"
                        placeholder="Invita il primo membro"
                        value={teamEmails[g.name] || ''}
                        onChange={(e) => setTeamEmails({ ...teamEmails, [g.name]: e.target.value })}
                        className="max-w-xs"
                      />
                    </div>
                  </Card>
                ))}
              </div>
              <div className="flex justify-between items-center pt-2">
                <button onClick={() => finish(false)} className="text-sm text-muted-foreground underline" disabled={saving}>
                  Salta onboarding
                </button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)}>← Indietro</Button>
                  <Button onClick={handleNextFromTeam}>Avanti →</Button>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Rocket className="w-5 h-5" /> Primo progetto
              </div>
              <div><Label>Nome progetto</Label><Input value={projectName} onChange={(e) => setProjectName(e.target.value)} /></div>
              <div><Label>Cliente</Label><Input value={projectClient} onChange={(e) => setProjectClient(e.target.value)} /></div>
              <div><Label>Data inizio</Label><Input type="date" value={projectStart} onChange={(e) => setProjectStart(e.target.value)} /></div>
              <div className="flex justify-between items-center pt-2">
                <button onClick={() => finish(false)} className="text-sm text-muted-foreground underline" disabled={saving}>
                  Salta per ora
                </button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(3)}>← Indietro</Button>
                  <Button onClick={() => finish(true)} disabled={!projectName.trim() || saving}>
                    Crea progetto e inizia
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
