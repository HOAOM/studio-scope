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
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let stopWatch: (() => void) | null = null;
    const watch = (s: Session | null) => {
      stopWatch?.();
      stopWatch = s ? startSessionWatch(s) : null;
    };

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        if (event === 'SIGNED_IN' && session) {
          queryClient.invalidateQueries({ queryKey: ['platform-admin-grade'] });
          setTimeout(() => { registerLogin(session); }, 0);
        }
        if (event === 'SIGNED_OUT') { watch(null); clearImpersonationState(); queryClient.clear(); }
        else if (session) watch(session);
      }
    );


    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session) watch(session);
    });

    return () => {
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
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
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
