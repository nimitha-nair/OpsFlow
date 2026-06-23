import { Card } from "@/components/ui/card";

import { PageHeader } from "../components/layout/PageHeader";
import { ActivityFeed } from "../components/activity/ActivityFeed";
import { useAuth } from "../context/auth-context";

export function ActivityPage() {
  const { user } = useAuth();
  const description =
    user?.role === "ADMIN"
      ? "Recent activity across the organization."
      : user?.role === "HR"
        ? "Expense, approval and ticket activity."
        : "Your recent tickets, tasks and expenses.";

  return (
    <>
      <PageHeader
        title="Activity"
        description={description}
        breadcrumbs={[{ label: "Activity" }]}
      />
      <Card className="p-6">
        <ActivityFeed limit={40} />
      </Card>
    </>
  );
}
