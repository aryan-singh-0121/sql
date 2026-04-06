// App root component

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "./contexts/AppContext";
import { initPgParser } from "@/lib/pgValidator";
import Index from "./pages/Index";
import EditorPage from "./pages/EditorPage";
import AdminPanel from "./pages/AdminPanel";
import PracticePage from "./pages/PracticePage";
import NotFound from "./pages/NotFound";

// Pre-load the PostgreSQL WASM parser in the background
initPgParser();

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AppProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/practice" element={<PracticePage />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
