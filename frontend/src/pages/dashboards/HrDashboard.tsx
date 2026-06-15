import { CalendarCheck, CalendarDays, Users } from "lucide-react";

import { EmptyState } from "../../components/common/EmptyState";
import { SectionCard } from "../../components/common/SectionCard";
import { PageHeader } from "../../components/layout/PageHeader";

export function HrDashboard() {
  return (
    <>
      <PageHeader
        title="HR Dashboard"
        description="People operations overview."
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Dashboard" }]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="Employee Overview"
          description="Headcount and recent changes."
        >
          <EmptyState
            compact
            icon={Users}
            title="No employee data"
            description="Employee summaries will appear here."
          />
        </SectionCard>

        <SectionCard
          title="Attendance Summary"
          description="Today's attendance at a glance."
        >
          <EmptyState
            compact
            icon={CalendarCheck}
            title="No attendance data"
            description="Attendance summaries will appear here."
          />
        </SectionCard>

        <SectionCard
          title="Leave Requests Queue"
          description="Requests awaiting HR action."
        >
          <EmptyState
            compact
            icon={CalendarDays}
            title="No requests in queue"
            description="Pending leave requests will appear here."
          />
        </SectionCard>
      </div>
    </>
  );
}
