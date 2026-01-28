import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import Admin from "./pages/Admin";
import Student from "./pages/Student";
import StudentDashboard from "./pages/StudentDashboard";
import NotFound from "./pages/NotFound";
import DebugPanel from "./components/DebugPanel";
import { AuthPage } from "./components/auth";
import { useAuth } from "./hooks/useAuth";

const queryClient = new QueryClient();

// DEV BYPASS CHECK
const isDevBypass = () => localStorage.getItem('dev_bypass_auth') === 'true';

// Protected route component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  // Allow dev bypass
  if (isDevBypass()) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Public route - redirect to /aluno if already logged in
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  // Allow dev bypass to still see login page (for switching modes)
  if (isDevBypass()) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/aluno" replace />;
  }

  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/aluno" replace />} />
    <Route
      path="/login"
      element={
        <PublicRoute>
          <AuthPage />
        </PublicRoute>
      }
    />
    <Route path="/admin" element={<Admin />} />
    <Route
      path="/aluno"
      element={
        <ProtectedRoute>
          <Student />
        </ProtectedRoute>
      }
    />
    <Route
      path="/aluno/dashboard"
      element={
        <ProtectedRoute>
          <StudentDashboard />
        </ProtectedRoute>
      }
    />
    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <DebugPanel />
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
