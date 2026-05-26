import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useUserRole } from "@/hooks/useUserRole";
import { OnboardingWizard } from "@/components/warroom/OnboardingWizard";
import Index from "./pages/Index";
import ProjectDetail from "./pages/ProjectDetail";
import AdminPanel from "./pages/AdminPanel";
import MessagesPage from "./pages/MessagesPage";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import UserProfile from "./pages/UserProfile";
import AcceptInvite from "./pages/AcceptInvite";
import SuperAdmin from "./pages/SuperAdmin";
import { Loader2 } from "lucide-react";
import { BugReportButton } from "@/components/test/BugReportButton";
import { ImpersonateBanner } from "@/components/layout/ImpersonateBanner";
import { useState } from "react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <>
      <ImpersonateBanner />
      <OnboardingGate />
      {children}
      <BugReportButton />
    </>
  );
}

function OnboardingGate() {
  const { roles } = useUserRole();
  const { data: settings } = useCompanySettings();
  const [skipped, setSkipped] = useState(() => sessionStorage.getItem('onboarding_skipped') === 'true');
  const isAdmin = roles.includes('admin' as any);
  const needsOnboarding = isAdmin && settings && !settings.onboarding_completed && !skipped;
  if (!needsOnboarding) return null;
  return (
    <OnboardingWizard
      open={true}
      settingsId={settings.id}
      onSkip={() => {
        sessionStorage.setItem('onboarding_skipped', 'true');
        setSkipped(true);
      }}
    />
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
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
                  <AdminPanel />
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
