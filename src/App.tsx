import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import ProjectDetail from "./pages/ProjectDetail";
import AdminPanel from "./pages/AdminPanel";
import MessagesPage from "./pages/MessagesPage";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import UserProfile from "./pages/UserProfile";
import AcceptInvite from "./pages/AcceptInvite";
import SetPassword from "./pages/SetPassword";
import SuperAdmin from "./pages/SuperAdmin";
import SsoLogin from "./pages/SsoLogin";
import CalendarPage from "./pages/CalendarPage";
import OrgChartPage from "./pages/OrgChartPage";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

import { ImpersonateBanner } from "@/components/layout/ImpersonateBanner";
import { TenantGuard } from "@/components/layout/TenantGuard";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { usePermissions } from "@/hooks/usePermissions";

const queryClient = new QueryClient();

function AuthTimeoutScreen() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="w-5 h-5" />
          <h1 className="text-lg font-semibold">Impossibile verificare la sessione</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Il controllo dell'accesso non si è completato: può dipendere da una
          connessione instabile o dal blocco dei dati di sessione nel browser
          (navigazione privata o cookie di terze parti disattivati).
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => window.location.reload()}>Riprova</Button>
          <Button variant="outline" onClick={() => window.location.replace("/auth")}>
            Vai al login
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, bootstrapTimedOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (bootstrapTimedOut && !user) {
    return <AuthTimeoutScreen />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Utente entrato via link di invito: nessuna azione permessa finché non
  // imposta una password propria.
  if ((user.user_metadata as any)?.must_set_password === true) {
    return <SetPassword />;
  }

  return (
    <>
      <ImpersonateBanner />
      <TenantGuard>{children}</TenantGuard>
    </>
  );
}



function AdminOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isOrgAdmin, isLoading } = usePermissions();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isOrgAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function PlatformOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isPlatformAdmin, isLoading } = usePermissions();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isPlatformAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/sso" element={<SsoLogin />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              }
            />
            <Route
              path="/project/:projectId"
              element={
                <ProtectedRoute>
                  <ProjectDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminOnlyRoute>
                    <AdminPanel />
                  </AdminOnlyRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/super-admin"
              element={
                <ProtectedRoute>
                  <PlatformOnlyRoute>
                    <SuperAdmin />
                  </PlatformOnlyRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/messages"
              element={
                <ProtectedRoute>
                  <MessagesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <UserProfile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/calendar"
              element={
                <ProtectedRoute>
                  <CalendarPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/org-chart"
              element={
                <ProtectedRoute>
                  <OrgChartPage />
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
