import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, PageKey } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

interface Props {
  children: ReactNode;
  page?: PageKey;
  level?: "view" | "edit";
}

export function ProtectedRoute({ children, page, level = "view" }: Props) {
  const { user, loading, can, firstAllowedPath } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (page && !can(page, level)) {
    const fallback = firstAllowedPath();
    if (fallback !== "/login" && fallback !== location.pathname) {
      return <Navigate to={fallback} replace />;
    }
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold mb-2">Access denied</h2>
        <p className="text-muted-foreground">You don't have permission to view this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}
