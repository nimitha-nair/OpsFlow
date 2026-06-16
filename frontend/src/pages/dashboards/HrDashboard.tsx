import { CalendarCheck, CalendarDays, Users } from "lucide-react";

import { EmptyState } from "../../components/common/EmptyState";
import { SectionCard } from "../../components/common/SectionCard";
import { WelcomeBanner } from "../../components/dashboard/WelcomeBanner";

export function HrDashboard() {
  return (
    <>
      <WelcomeBanner
        title="HR Dashboard"
        subtitle="A snapshot of people operations across the team."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
