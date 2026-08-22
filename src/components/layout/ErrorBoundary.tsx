/**
 * ErrorBoundary globale — evita la "pagina nera": qualunque eccezione di
 * rendering viene catturata e mostrata come schermata leggibile con azioni
 * di recupero (ricarica / torna alla home / pulisci sessione locale).
 */
import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary]', error, info);
  }

  private reset = () => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      /* storage non accessibile: nulla da pulire */
    }
    window.location.replace('/auth');
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            <h1 className="text-lg font-semibold">Qualcosa è andato storto</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            L'applicazione ha incontrato un errore imprevisto e non è riuscita a
            completare il caricamento. Puoi riprovare; se il problema persiste,
            pulisci la sessione locale e accedi di nuovo.
          </p>
          <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-40 whitespace-pre-wrap">
            {error.message}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => window.location.reload()}>Ricarica</Button>
            <Button variant="outline" onClick={() => window.location.replace('/')}>
              Torna alla home
            </Button>
            <Button variant="ghost" onClick={this.reset}>
              Pulisci sessione e accedi
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
