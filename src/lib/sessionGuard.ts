/**
 * sessionGuard — enforcement "una sessione per utente".
 *
 * Ad ogni login registra la sessione (timestamp, IP approssimativo, città/paese,
 * user agent) tramite la RPC `register_login`. Se il backend rileva un'altra
 * sessione attiva, TUTTE le sessioni (inclusa quella appena creata) vengono
 * invalidate e l'utente viene disconnesso ovunque.
 */
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export const SESSION_KILL_MESSAGE =
  'Accesso rilevato da un altro dispositivo — per motivi di sicurezza tutte le sessioni sono state chiuse. Effettua di nuovo il login.';

const KILL_FLAG = 'ss.session-kill';
const SEEN_PREFIX = 'ss.session-registered:';

function decodeSessionId(accessToken: string): string | null {
  try {
    const payload = JSON.parse(
      atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    );
    return payload?.session_id ?? null;
  } catch {
    return null;
  }
}

type Geo = { ip?: string; city?: string; country?: string };

async function lookupGeo(): Promise<Geo> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch('https://ipapi.co/json/', { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return {};
    const d = await res.json();
    return { ip: d?.ip, city: d?.city, country: d?.country_name ?? d?.country };
  } catch {
    return {};
  }
}

export function consumeSessionKillMessage(): string | null {
  const v = localStorage.getItem(KILL_FLAG);
  if (v) localStorage.removeItem(KILL_FLAG);
  return v;
}

/** Ritorna true se la sessione è stata invalidata (login concorrente). */
export async function registerLogin(session: Session): Promise<boolean> {
  const sessionId = decodeSessionId(session.access_token) ?? session.access_token.slice(-32);
  const seenKey = SEEN_PREFIX + sessionId;
  if (sessionStorage.getItem(seenKey)) return false;
  sessionStorage.setItem(seenKey, '1');

  const geo = await lookupGeo();
  const { data, error } = await (supabase as any).rpc('register_login', {
    p_session_id: sessionId,
    p_ip: geo.ip ?? null,
    p_city: geo.city ?? null,
    p_country: geo.country ?? null,
    p_user_agent: navigator.userAgent,
  });
  if (error) return false;

  if (data?.revoke_all) {
    localStorage.setItem(KILL_FLAG, SESSION_KILL_MESSAGE);
    sessionStorage.removeItem(seenKey);
    await supabase.auth.signOut({ scope: 'global' });
    return true;
  }
  return false;
}

/**
 * Heartbeat: se la riga della sessione corrente risulta revocata (login
 * concorrente da un altro dispositivo), disconnette immediatamente anche
 * questo client senza aspettare la scadenza dell'access token.
 */
export function startSessionWatch(session: Session): () => void {
  const sessionId = decodeSessionId(session.access_token) ?? session.access_token.slice(-32);
  let stopped = false;

  const check = async () => {
    if (stopped || document.visibilityState === 'hidden') return;
    const { data, error } = await supabase
      .from('user_login_sessions')
      .select('revoked_at')
      .eq('user_id', session.user.id)
      .eq('session_id', sessionId)
      .maybeSingle();
    if (error || !data?.revoked_at || stopped) return;
    stopped = true;
    localStorage.setItem(KILL_FLAG, SESSION_KILL_MESSAGE);
    sessionStorage.removeItem(SEEN_PREFIX + sessionId);
    await supabase.auth.signOut();
    window.location.replace('/auth');
  };

  const interval = window.setInterval(check, 20000);
  document.addEventListener('visibilitychange', check);
  void check();

  return () => {
    stopped = true;
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', check);
  };
}

export async function closeLoginSessions() {
  try {
    await (supabase as any).rpc('close_login_sessions', { p_reason: 'signed_out' });
  } catch {
    /* best effort */
  }
}
