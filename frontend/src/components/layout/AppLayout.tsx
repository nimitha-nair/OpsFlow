import { useState } from "react";
import { Navigate, Outlet } from "react-router-dom";

import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "../../context/auth-context";
import { AppSidebar } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";
import { MobileBottomNav } from "./MobileBottomNav";
import { SupportWidget } from "./SupportWidget";

/**
 * Shared application shell used as the parent route element for each role's
 * section. Renders the role-aware sidebar, top navigation, and the matched
 * child route via <Outlet />.
 */
export function AppLayout() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // ProtectedRoute already guards this, but guard here too for type-safety.
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <AppSidebar
        role={user.role}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className="flex min-h-svh flex-col lg:pl-64">
        <AppTopbar onMenuClick={() => setMobileOpen(true)} />
        {/* Extra bottom padding on mobile so content clears the bottom nav bar. */}
        <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
      <SupportWidget />
      <MobileBottomNav role={user.role} onMore={() => setMobileOpen(true)} />
      <Toaster richColors closeButton />
    </div>
  );
}
