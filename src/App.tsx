import React, { useEffect, Component, ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/ui/header";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Settings from "./pages/Settings";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import { RepairOrderQueueFullScreen } from "./pages/RepairOrderQueueFullScreen";
import OrphanedPackages from "./pages/OrphanedPackages";
import CustomerPayment from "./pages/CustomerPayment";
import VendorShipment from "./pages/VendorShipment";
import PendingSerials from "./pages/PendingSerials";
import RmaRequests from "./pages/RmaRequests";
import OrderTaxes from "./pages/OrderTaxes";
import { toast } from "sonner";

const queryClient = new QueryClient();

// Error Boundary to catch React component errors
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("React Error Boundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-bold text-destructive">Something went wrong</h1>
            <p className="text-muted-foreground">An unexpected error occurred. Please refresh the page.</p>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Global error handler component
function GlobalErrorHandler({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
      event.preventDefault(); // Prevent default browser behavior (page crash)
      
      // Show a user-friendly toast instead of crashing
      toast.error("An error occurred. Please try again.", {
        description: event.reason?.message || "Unknown error",
      });
    };

    // Handle uncaught errors
    const handleError = (event: ErrorEvent) => {
      console.error("Uncaught error:", event.error);
      event.preventDefault();
      
      toast.error("An unexpected error occurred", {
        description: event.message || "Unknown error",
      });
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleError);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  return (
    <>
      <Header />
      <main className="min-h-screen bg-background">
        {children}
      </main>
    </>
  );
}

function RecoveryRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check if this is a recovery flow (password reset) immediately
    const hash = location.hash.substring(1);
    if (hash) {
      const urlParams = new URLSearchParams(hash);
      const type = urlParams.get('type');
      const accessToken = urlParams.get('access_token');
      
      if (type === 'recovery' && accessToken) {
        // Force immediate redirect to reset password page, bypassing auth checks
        navigate(`/reset-password${location.hash}`, { replace: true });
        return;
      }
    }
  }, [location.hash, navigate]);

  return null;
}

function AppRoutes() {
  return (
    <>
      <RecoveryRedirect />
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pay/:token" element={<CustomerPayment />} />
        <Route path="/vendor-shipment/:token" element={<VendorShipment />} />
        <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/staff" element={<Navigate to="/staff/orders" replace />} />
        <Route path="/staff/orders" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/staff/inventory" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/staff/waste-analytics" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/staff/purchasing" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/staff/receiving" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/staff/repair-lookup" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/staff/customers" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/staff/vendors" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/staff/accounting" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/staff/users" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/repair-queue" element={<ProtectedRoute><RepairOrderQueueFullScreen /></ProtectedRoute>} />
        <Route path="/receiving/orphaned-packages" element={<ProtectedRoute><OrphanedPackages /></ProtectedRoute>} />
        <Route path="/pending-serials" element={<ProtectedRoute><PendingSerials /></ProtectedRoute>} />
        <Route path="/rma" element={<ProtectedRoute><RmaRequests /></ProtectedRoute>} />
        <Route path="/order-taxes" element={<ProtectedRoute><OrderTaxes /></ProtectedRoute>} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <GlobalErrorHandler>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </GlobalErrorHandler>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
