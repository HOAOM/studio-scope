/**
 * AcceptInvite — landing page for /accept-invite?token=...
 * Flow:
 *  0. Se l'email di invito porta token_hash+type (riscrittura in
 *     auth-email-hook), consuma l'OTP qui con verifyOtp() dopo un signOut
 *     locale: il link implicito /verify veniva bruciato dal prefetch dei client
 *     di posta e l'invitato atterrava senza sessione.
 *  1. Peek invite via public RPC (parallel to auth bootstrap) to show org + email.
 *  2. If not logged in → redirect to /auth with returnTo back here.
 *  3. If logged in → call accept_org_invite RPC, then invalidate only the
 *     org/role caches instead of reloading the whole app.
 *  4. Se l'utente deve ancora creare la propria password (must_set_password),
 *     il gate viene applicato QUI, senza dipendere da ProtectedRoute.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import SetPassword from '@/pages/SetPassword';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Peek {
  organization_name: string;
  email: string;
  base_role: string;
  status: string;
  expires_at: string;
}

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const tokenHash = params.get('token_hash') ?? '';
  const otpType = (params.get('type') ?? 'invite') as 'invite' | 'magiclink' | 'recovery';
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [peek, setPeek] = useState<Peek | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState(false);
  const [verifying, setVerifying] = useState(!!tokenHash);

  // Consumo esplicito del magic link / invito.
  useEffect(() => {
    if (!tokenHash) return;
    let cancelled = false;
    (async () => {
      try {
        // Evita di operare sulla sessione di un altro account già presente in
        // questo browser (tipico: l'admin che ha inviato l'invito).
        await supabase.auth.signOut({ scope: 'local' });
      } catch { /* best effort */ }
      const { error: vErr } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      });
      if (cancelled) return;
      if (vErr) setError('invite_link_expired');
      setVerifying(false);
      // Ripulisce l'URL dal token consumato (evita retry su refresh).
      const url = new URL(window.location.href);
      url.searchParams.delete('token_hash');
      url.searchParams.delete('type');
      url.searchParams.delete('email');
      window.history.replaceState({}, '', url.toString());
    })();
    return () => { cancelled = true; };
  }, [tokenHash, otpType]);

  useEffect(() => {
    if (!token) { setError('missing_token'); return; }
    // Direct RPC (callable by anon): no edge-function cold start, and it runs
    // in parallel with the auth bootstrap instead of waiting for it.
    (async () => {
      const { data, error } = await (supabase as any).rpc('peek_org_invite', { p_token: token });
      if (error) { setError('invite_not_found'); return; }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) { setError('invite_not_found'); return; }
      setPeek(row as Peek);
    })();
  }, [token]);

  const mustSetPassword = (user?.user_metadata as any)?.must_set_password === true;

  const accept = async () => {
    if (!token) return;
    setAccepting(true);
    try {
      const { data, error } = await (supabase as any).rpc('accept_org_invite', { p_token: token });
      if (error) throw error;
      if (!data?.ok) {
        setError(data?.error ?? 'accept_failed');
        return;
      }
      // Targeted invalidation instead of a full page reload.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-organizations'] }),
        queryClient.invalidateQueries({ queryKey: ['user_roles_self'] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
      ]);
      setDone(true);
      // Se l'utente non ha ancora una password propria resta qui: il gate
      // sottostante mostra SetPassword senza passare da ProtectedRoute.
      if (!mustSetPassword) setTimeout(() => navigate('/'), 1200);
    } catch (e: any) {
      setError(e?.message ?? 'accept_failed');
    } finally {
      setAccepting(false);
    }
  };

  // Only block on auth when the invite preview is not ready yet.
  if (verifying || (loading && !peek && !error)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  // Gate password anche su questa rotta: l'utente entrato via link di invito
  // deve creare la propria password prima di poter usare l'app.
  if (user && mustSetPassword && (done || peek?.status === 'accepted')) {
    return <SetPassword />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Organization invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && !done && (
            <div className="flex items-start gap-2 text-sm p-3 bg-destructive/10 text-destructive rounded">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{humanError(error)}</span>
            </div>
          )}

          {peek && !done && (
            <>
              <p className="text-sm">
                You've been invited to join{' '}
                <span className="font-semibold">{peek.organization_name}</span> as{' '}
                <span className="font-semibold">{peek.base_role}</span>.
              </p>
              <p className="text-xs text-muted-foreground">
                Invitation sent to <code>{peek.email}</code>. It expires on{' '}
                {new Date(peek.expires_at).toLocaleDateString()}.
              </p>

              {peek.status === 'accepted' ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 text-sm p-3 bg-green-500/10 text-green-700 dark:text-green-400 rounded">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      <strong>Invito già accettato.</strong> Questo link è stato usato: accedi
                      con le tue credenziali per entrare in {peek.organization_name}.
                    </span>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => navigate('/auth')}
                  >
                    Vai al login
                  </Button>
                </div>
              ) : isInviteExpired(peek) ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 text-sm p-3 bg-destructive/10 text-destructive rounded">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      <strong>Invito scaduto o non più valido.</strong> Chiedi un nuovo invito
                      all'amministratore del tuo studio. Se hai già un account puoi accedere
                      direttamente.
                    </span>
                  </div>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => navigate('/auth')}
                  >
                    Vai al login
                  </Button>
                </div>
              ) : !user ? (
                <Button
                  className="w-full"
                  onClick={() =>
                    navigate(`/auth?returnTo=${encodeURIComponent(`/accept-invite?token=${token}`)}`)
                  }
                >
                  Sign in to accept
                </Button>
              ) : user.email?.toLowerCase() !== peek.email.toLowerCase() ? (
                <div className="text-sm text-amber-600 dark:text-amber-400">
                  You are signed in as <code>{user.email}</code>, but this invite is for{' '}
                  <code>{peek.email}</code>. Sign out and use the right account.
                </div>
              ) : (
                <Button
                  className="w-full"
                  onClick={accept}
                  disabled={accepting || peek.status !== 'pending'}
                >
                  {accepting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Accept invitation
                </Button>
              )}
            </>
          )}

          {done && (
            <div className="flex flex-col items-center gap-2 py-4">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
              <p className="text-sm font-medium">Welcome aboard!</p>
              <p className="text-xs text-muted-foreground">Redirecting…</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function isInviteExpired(peek: Peek): boolean {
  if (peek.status === 'expired' || peek.status === 'revoked') return true;
  if (peek.status !== 'pending') return false;
  const expiresAt = new Date(peek.expires_at);
  return !isNaN(expiresAt.getTime()) && expiresAt < new Date();
}

function humanError(code: string): string {
  switch (code) {
    case 'missing_token': return 'No invite token provided.';
    case 'invite_not_found': return 'Invite link not valid.';
    case 'invite_expired': return 'This invite has expired. Ask the organization owner for a new one.';
    case 'invite_accepted': return 'This invite has already been accepted.';
    case 'invite_revoked': return 'This invite was revoked.';
    case 'email_mismatch': return 'You are signed in with a different email than the one this invite was sent to.';
    case 'not_authenticated': return 'You must sign in first.';
    default: return code;
  }
}
