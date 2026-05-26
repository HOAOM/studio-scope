/**
 * AcceptInvite — landing page for /accept-invite?token=...
 * Flow:
 *  1. Peek invite via public RPC to show org + email expected.
 *  2. If not logged in → redirect to /auth with returnTo back here.
 *  3. If logged in → call accept_org_invite RPC.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [peek, setPeek] = useState<Peek | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setError('missing_token'); return; }
    (async () => {
      const { data, error } = await (supabase as any).rpc('peek_org_invite', { p_token: token });
      if (error) { setError(error.message); return; }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) { setError('invite_not_found'); return; }
      setPeek(row);
    })();
  }, [token]);

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
      setDone(true);
      setTimeout(() => navigate('/'), 1500);
    } catch (e: any) {
      setError(e?.message ?? 'accept_failed');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
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

              {!user ? (
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
