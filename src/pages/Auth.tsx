import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { z } from 'zod';
import { Activity, Loader2 } from 'lucide-react';
import { consumeSessionKillMessage } from '@/lib/sessionGuard';


const authSchema = z.object({
  email: z.string().trim().email({ message: "Invalid email address" }).max(255),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }).max(100),
});

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo') ?? '/';

  useEffect(() => {
    const killed = consumeSessionKillMessage();
    if (killed) toast.error(killed, { duration: 10000 });
  }, []);

  useEffect(() => {
    if (user && !loading) {
      navigate(returnTo);
    }
  }, [user, loading, navigate, returnTo]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = authSchema.safeParse({ email, password });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast.error('Email o password non validi');
        } else if (error.message.includes('Email not confirmed')) {
          toast.error('Conferma la tua email prima di accedere');
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success('Bentornato!');
        navigate(returnTo);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
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
