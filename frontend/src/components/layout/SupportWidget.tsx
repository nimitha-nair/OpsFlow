import { LifeBuoy } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/auth-context";
import { roleBasePath } from "../../lib/navigation";

/**
 * Floating help-desk entry point. Help Desk is no longer a primary nav module;
 * this button is available from every authenticated page so anyone can raise or
 * track a ticket without hunting through navigation.
 */
export function SupportWidget() {
  const { user } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  const to = `${roleBasePath[user.role]}/helpdesk`;
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      aria-label="Help Desk & Support"
      title="Help Desk & Support"
      // Sits above the mobile bottom nav (bottom-20) and drops to the corner on md+.
      className="no-print fixed bottom-20 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:bottom-5 md:right-5"
    >
      <LifeBuoy className="size-5" />
      <span className="hidden sm:inline">Support</span>
    </button>
  );
}
