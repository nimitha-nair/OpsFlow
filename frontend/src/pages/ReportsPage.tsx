import { ReportsWorkspace } from "../components/reports/ReportsWorkspace";
import { HrInsightsDashboard } from "../components/reports/HrInsightsDashboard";
import { useAuth } from "../context/auth-context";

/**
 * Reports entry point. Admins get the executive BI workspace; HR gets the
 * dedicated HR Insights Dashboard. Both are section-based (no segmented tabs)
 * and carry CSV/PDF export.
 */
export function ReportsPage() {
  const { user } = useAuth();
  if (user?.role === "ADMIN") {
    return <ReportsWorkspace />;
  }
  return <HrInsightsDashboard />;
}
