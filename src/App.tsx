import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ShipmentProvider } from "@/context/ShipmentContext";
import { AuthProvider } from "@/context/AuthContext";
import { BrandingProvider } from "@/context/BrandingContext";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Dashboard from "@/pages/Dashboard";
import ShipmentsList from "@/pages/ShipmentsList";
import ShipmentDetail from "@/pages/ShipmentDetail";
import ShipmentForm from "@/pages/ShipmentForm";
import ShipmentCostsPage from "@/pages/ShipmentCostsPage";
import CostsPage from "@/pages/CostsPage";
import CostDashboard from "@/pages/CostDashboard";
import SettingsPage from "@/pages/SettingsPage";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const Protected = ({ children, page, level }: any) => (
  <ProtectedRoute page={page} level={level}>
    <AppLayout>{children}</AppLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BrandingProvider>
          <ShipmentProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Protected page="dashboard"><Dashboard /></Protected>} />
              <Route path="/shipments" element={<Protected page="shipments"><ShipmentsList /></Protected>} />
              <Route path="/shipments/new" element={<Protected page="shipments" level="edit"><ShipmentForm /></Protected>} />
              <Route path="/shipments/:id" element={<Protected page="shipments"><ShipmentDetail /></Protected>} />
              <Route path="/shipments/:id/edit" element={<Protected page="shipments" level="edit"><ShipmentForm /></Protected>} />
              <Route path="/shipments/:id/costs" element={<Protected page="shipments"><ShipmentCostsPage /></Protected>} />
              <Route path="/costs" element={<Protected page="costs"><CostsPage /></Protected>} />
              <Route path="/cost-dashboard" element={<Protected page="costs"><CostDashboard /></Protected>} />
              <Route path="/settings" element={<Protected page="settings"><SettingsPage /></Protected>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ShipmentProvider>
          </BrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
