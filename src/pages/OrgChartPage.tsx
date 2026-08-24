/**
 * OrgChartPage — vista in SOLA LETTURA dell'organigramma v3 per i membri
 * che non hanno accesso all'Admin Panel. Owner e admin lo gestiscono dentro
 * la scheda Organizzazione (/admin, tab Organigramma).
 *
 * La visibilità resta decisa server-side da public.org_chart_scope().
 */
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OrgChartPanel } from '@/components/admin/OrgChart/OrgChartPanel';
import { usePermissions } from '@/hooks/usePermissions';
import { useEffectiveOwner } from '@/hooks/useEffectiveOwner';

export default function OrgChartPage() {
  const navigate = useNavigate();
  const { isOrgAdmin } = usePermissions();
  const { isEffectiveOwner } = useEffectiveOwner();
  const canManage = isOrgAdmin || isEffectiveOwner;

  return (
    <div className="min-h-screen bg-background war-room-grid">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="container flex items-center gap-3 py-4">
          <Button variant="ghost" size="icon" aria-label="Torna indietro" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Network className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Organigramma</h1>
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => navigate('/admin?tab=orgchart')}
            >
              Gestisci nella scheda Organizzazione
            </Button>
          )}
        </div>
      </header>

      <main className="container py-6">
        <OrgChartPanel readOnly />
      </main>
    </div>
  );
}
