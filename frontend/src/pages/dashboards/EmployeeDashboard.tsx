import { CalendarCheck, CalendarDays, Receipt } from "lucide-react";

import { EmptyState } from "../../components/common/EmptyState";
import { SectionCard } from "../../components/common/SectionCard";
import { PageHeader } from "../../components/layout/PageHeader";

export function EmployeeDashboard() {
  return (
    <>
      <PageHeader
        title="Employee Dashboard"
        description="Your attendance, leave, and pay at a glance."
        breadcrumbs={[
          { label: "Employee", to: "/employee" },
          { label: "Dashboard" },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="My Attendance"
          description="Your recent check-ins."
        >
          <EmptyState
            compact
            icon={CalendarCheck}
            title="No attendance yet"
            description="Your attendance records will appear here."
          />
        </SectionCard>

        <SectionCard
          title="Leave Balance"
          description="Your available leave."
        >
          <EmptyState
            compact
            icon={CalendarDays}
            title="No leave data"
            description="Your leave balance will appear here."
          />
        </SectionCard>

        <SectionCard
          title="Recent Payslips"
          description="Your latest payslips."
        >
          <EmptyState
            compact
            icon={Receipt}
            title="No payslips yet"
            description="Your payslips will appear here."
          />
        </SectionCard>
      </div>
    </>
  );
}
