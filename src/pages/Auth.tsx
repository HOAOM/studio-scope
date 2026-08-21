import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { z } from 'zod';
import { Activity, Loader2 } from 'lucide-react';
import { consumeSessionKillMessage } from '@/lib/sessionGuard';

/**
 * Messaggio unico per QUALUNQUE fallimento di login: credenziali errate e
 * utente valido ma non appartenente all'organizzazione del dominio corrente
 * devono essere indistinguibili (stesso testo, stesso comportamento UI).
 */
export const LOGIN_GENERIC_ERROR = 'Email o password non validi';
/** Flag impostato da TenantGuard quando nega l'accesso su dominio tenant. */
export const LOGIN_DENIED_FLAG = 'ss.login-denied';
/** Messaggio distinto: credenziali valide ma account senza alcuna organizzazione. */
export const LOGIN_NO_ORG_ERROR =
  'Account senza organizzazione collegata. Contatta l\u2019amministratore del tuo studio.';
/** Flag impostato da TenantGuard quando l'utente non ha alcuna membership. */
export const LOGIN_NO_ORG_FLAG = 'ss.login-no-org';

const authSchema = z.object({
  email: z.string().trim().email({ message: "Invalid email address" }).max(255),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }).max(100),
});

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { user, loading, signIn, signOut } = useAuth();
  const { tenant, loading: tenantLoading } = useTenant();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo') ?? '/';

  useEffect(() => {
    const killed = consumeSessionKillMessage();
    if (killed) toast.error(killed, { duration: 10000 });
    if (localStorage.getItem(LOGIN_NO_ORG_FLAG)) {
      localStorage.removeItem(LOGIN_NO_ORG_FLAG);
      localStorage.removeItem(LOGIN_DENIED_FLAG);
      setFormError(LOGIN_NO_ORG_ERROR);
    } else if (localStorage.getItem(LOGIN_DENIED_FLAG)) {
      localStorage.removeItem(LOGIN_DENIED_FLAG);
      setFormError(LOGIN_GENERIC_ERROR);
    }
  }, []);

  useEffect(() => {
    if (user && !loading && !formError && !isSubmitting) {
      navigate(returnTo);
    }
  }, [user, loading, navigate, returnTo, formError, isSubmitting]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const validation = authSchema.safeParse({ email, password });
    if (!validation.success) {
      setFormError(validation.error.errors[0].message);
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        if (
          error.message.includes('Invalid login credentials') ||
          error.message.includes('Email not confirmed')
        ) {
          setFormError(LOGIN_GENERIC_ERROR);
        } else {
          setFormError(error.message);
        }
        return;
      }

      // Verifica appartenenza REALE all'organizzazione del dominio corrente
      // PRIMA di qualunque feedback di successo.
      if (tenant?.organization_id) {
        const { data: auth } = await supabase.auth.getUser();
        let belongs = false;
        if (auth.user) {
          const { data, error: memberError } = await supabase
            .from('organization_members')
            .select('id')
            .eq('organization_id', tenant.organization_id)
            .eq('user_id', auth.user.id)
            .maybeSingle();
          belongs = !memberError && !!data;
        }
        if (!belongs) {
          // Distinzione: nessuna membership in NESSUNA org = account orfano
          // (messaggio esplicito). Membership altrove ma non su questo dominio
          // = messaggio generico, per non rivelare l'esistenza dell'account.
          let anyOrg = 0;
          if (auth.user) {
            const { count } = await supabase
              .from('organization_members')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', auth.user.id);
            anyOrg = count ?? 0;
          }
          await signOut();
          setFormError(anyOrg === 0 ? LOGIN_NO_ORG_ERROR : LOGIN_GENERIC_ERROR);
          return;
        }
      }

      navigate(returnTo);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || tenantLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background war-room-grid flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-card border-border">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Activity className="w-8 h-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">War Room</span>
          </div>
          <CardTitle className="text-xl">Accedi</CardTitle>
          <CardDescription>
            Inserisci le tue credenziali per entrare nella War Room
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Accedi
            </Button>
            {formError && (
              <p role="alert" className="text-sm text-destructive text-center">
                {formError}
              </p>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            L'accesso è riservato agli account creati tramite invito o
            attivazione da{' '}
            <a
              href="https://kroneel.com"
              className="text-primary hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              kroneel.com
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
