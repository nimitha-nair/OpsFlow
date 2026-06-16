import { Building2, CalendarDays, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "../../components/common/EmptyState";
import { SectionCard } from "../../components/common/SectionCard";
import { WelcomeBanner } from "../../components/dashboard/WelcomeBanner";

export function AdminDashboard() {
  return (
    <>
      <WelcomeBanner
        title="Admin Dashboard"
        subtitle="Here's an overview of organization activity and pending actions."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SectionCard
          title="Recent Users"
          description="Latest accounts added to the organization."
          actions={
            <Link
              to="/admin/users"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              View all
            </Link>
          }
        >
          <EmptyState
            compact
            icon={Users}
            title="No recent users"
            description="Newly created users will appear here."
          />
        </SectionCard>

        <SectionCard
          title="Pending Leave Requests"
          description="Requests awaiting approval."
        >
          <EmptyState
            compact
            icon={CalendarDays}
            title="No pending requests"
            description="Leave requests needing review will appear here."
          />
        </SectionCard>

        <SectionCard
          title="Department Overview"
          description="Headcount and structure by department."
        >
          <EmptyState
            compact
            icon={Building2}
            title="No departments yet"
            description="Department summaries will appear here."
          />
        </SectionCard>
      </div>
    </>
  );
}
