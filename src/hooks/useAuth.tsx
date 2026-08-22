import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { registerLogin, closeLoginSessions, startSessionWatch } from '@/lib/sessionGuard';
import { clearImpersonationState } from '@/components/layout/ImpersonateBanner';


interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** true se il bootstrap auth non si è risolto entro il timeout */
  bootstrapTimedOut: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Oltre questa soglia mostriamo un messaggio esplicito invece dello spinner. */
const BOOTSTRAP_TIMEOUT_MS = 10000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapTimedOut, setBootstrapTimedOut] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    let stopWatch: (() => void) | null = null;
    let settled = false;
    const watch = (s: Session | null) => {
      stopWatch?.();
      stopWatch = s ? startSessionWatch(s) : null;
    };
    const settle = () => {
      settled = true;
      setLoading(false);
      setBootstrapTimedOut(false);
    };

    // Rete bloccata / storage rotto / getSession che non risolve mai: evitiamo
    // lo spinner infinito e lasciamo decidere all'utente.
    const timer = window.setTimeout(() => {
      if (!settled) {
        setLoading(false);
        setBootstrapTimedOut(true);
      }
    }, BOOTSTRAP_TIMEOUT_MS);

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        settle();
        if (event === 'SIGNED_IN' && session) {
          queryClient.invalidateQueries({ queryKey: ['platform-admin-grade'] });
          setTimeout(() => { registerLogin(session); }, 0);
        }
        if (event === 'SIGNED_OUT') { watch(null); clearImpersonationState(); queryClient.clear(); }
        else if (session) watch(session);
      }
    );


    // THEN check for existing session
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        settle();
        if (session) watch(session);
      })
      .catch((e) => {
        console.error('[auth] getSession failed', e);
        setLoading(false);
        setBootstrapTimedOut(true);
      });

    return () => {
      window.clearTimeout(timer);
      subscription.unsubscribe();
      stopWatch?.();
    };
  }, []);


  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { error };
  };

  const signOut = async () => {
    await closeLoginSessions();
    // Chiude le sessioni di impersonazione aperte lato DB e ripulisce SEMPRE
    // lo stato locale (impersonateOrgId + activeOrgId): altrimenti restava
    // residuo tra un login e l'altro sullo stesso browser.
    try {
      await (supabase as any).rpc('platform_impersonation_end_all');
    } catch {
      /* best effort: l'utente non platform admin non ha permessi */
    }
    clearImpersonationState();
    await supabase.auth.signOut();
  };


  return (
    <AuthContext.Provider value={{ user, session, loading, bootstrapTimedOut, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
