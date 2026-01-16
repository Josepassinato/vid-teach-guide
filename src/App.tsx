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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/aluno" replace />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/aluno" element={<Student />} />
            <Route path="/aluno/dashboard" element={<StudentDashboard />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <DebugPanel />
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
