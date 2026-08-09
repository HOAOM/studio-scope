import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ShieldAlert } from 'lucide-react';

const SITE_API = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/site-api`;

export default function SsoLogin() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ticket = params.get('ticket');

    if (!ticket) {
      setError('Link di accesso non valido, torna su kroneel.com e riprova');
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${SITE_API}/sso/redeem`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket }),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.session?.access_token) {
          if (!cancelled) setError('Link di accesso scaduto, torna su kroneel.com e riprova');
          return;
        }

        const { error: sessErr } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (sessErr) {
          if (!cancelled) setError('Link di accesso scaduto, torna su kroneel.com e riprova');
          return;
        }
        if (!cancelled) navigate('/', { replace: true });
      } catch {
        if (!cancelled) setError('Link di accesso scaduto, torna su kroneel.com e riprova');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params, navigate]);

  if (!error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Accesso in corso…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <ShieldAlert className="w-8 h-8 text-destructive" />
          </div>
          <CardTitle className="text-xl">Accesso non riuscito</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild>
            <Link to="/auth">Vai al login</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
