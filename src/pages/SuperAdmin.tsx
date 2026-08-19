/**
 * SuperAdmin — global console reserved to the PLATFORM staff layer
 * (public.platform_admins: grade 'staff' or 'owner').
 * A client-studio admin (app_role='admin') has NO access here; their scope is
 * /admin, which only administers their own organization.
 *
 * Tabs:
 *  - Organizations: list/manage all client orgs, tier, status, impersonate.
 *  - Discount codes: CRUD discount_codes.
 *  - Referral codes: read-only list of auto-generated referrals.
 *  - Metrics: global KPIs (MRR estimate, churn risk, top orgs).
 */
import { useNavigate } from 'react-router-dom';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { OrganizationsTable } from '@/components/super-admin/OrganizationsTable';
import { DiscountCodesPanel } from '@/components/super-admin/DiscountCodesPanel';
import { ReferralCodesPanel } from '@/components/super-admin/ReferralCodesPanel';
import { GlobalMetricsPanel } from '@/components/super-admin/GlobalMetricsPanel';
import { TierLimitsPanel } from '@/components/super-admin/TierLimitsPanel';
import { CredentialsPanel } from '@/components/super-admin/CredentialsPanel';
import { ImpersonateBanner } from '@/components/layout/ImpersonateBanner';

export default function SuperAdmin() {
  const navigate = useNavigate();
  const { isPlatformAdmin, isLoading } = usePlatformAdmin();

  if (isLoading) return null;
  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3 max-w-sm">
          <ShieldAlert className="w-10 h-10 mx-auto text-destructive" />
          <h1 className="text-xl font-bold">Super-admin only</h1>
          <p className="text-sm text-muted-foreground">
            You do not have permission to access this console.
          </p>
          <Button onClick={() => navigate('/')}>Back to app</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ImpersonateBanner />
      <header className="border-b bg-card/40 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> App
          </Button>
          <div>
            <h1 className="text-lg font-bold">StudioScope Super-Admin</h1>
            <p className="text-[11px] text-muted-foreground">
              Manage every client organization, billing & platform metrics.
            </p>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto">
        <Tabs defaultValue="orgs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="orgs">Organizations</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            <TabsTrigger value="discounts">Discount codes</TabsTrigger>
            <TabsTrigger value="referrals">Referrals</TabsTrigger>
            <TabsTrigger value="limits">Tier limits</TabsTrigger>
          </TabsList>
          <TabsContent value="orgs"><OrganizationsTable /></TabsContent>
          <TabsContent value="metrics"><GlobalMetricsPanel /></TabsContent>
          <TabsContent value="discounts"><DiscountCodesPanel /></TabsContent>
          <TabsContent value="referrals"><ReferralCodesPanel /></TabsContent>
          <TabsContent value="limits"><TierLimitsPanel /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
