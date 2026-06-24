import { useState } from "react";

import { Card } from "@/components/ui/card";
import { makeRange, rangeToParams, type DateRange } from "@/lib/date-range";
import { ActiveRangeBadge } from "../components/common/ActiveRangeBadge";
import { DateRangeFilter } from "../components/common/DateRangeFilter";
import { PageHeader } from "../components/layout/PageHeader";
import { ActivityFeed } from "../components/activity/ActivityFeed";
import { useAuth } from "../context/auth-context";

export function ActivityPage() {
  const { user } = useAuth();
  const [range, setRange] = useState<DateRange>(() => makeRange("all"));

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
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <DateRangeFilter value={range} onChange={setRange} />
          <ActiveRangeBadge range={range} />
        </div>
        <ActivityFeed limit={40} dateParams={rangeToParams(range)} />
      </Card>
    </>
  );
}
