import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Building2, ClipboardList, Users } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { SectionCard } from "../../components/common/SectionCard";
import { DepartmentDistribution } from "../../components/dashboard/DepartmentDistribution";
import { RecentUsersList } from "../../components/dashboard/RecentUsersList";
import { StatCard } from "../../components/dashboard/StatCard";
import { WelcomeBanner } from "../../components/dashboard/WelcomeBanner";
import { listProjects } from "../../lib/projects-api";
import { listTasks } from "../../lib/tasks-api";
import { apiErrorMessage, listUsers } from "../../lib/users-api";
import type { Project } from "../../types/project";
import type { Task } from "../../types/task";
import type { User } from "../../types/user";

export function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [u, p, t] = await Promise.all([
          listUsers({ limit: 100 }),
          listProjects({ limit: 100 }),
          listTasks({ limit: 100 }),
        ]);
        if (cancelled) return;
        setUsers(u.data);
        setProjects(p.data);
        setTasks(t);
      } catch (err) {
        if (!cancelled) {
          setError(apiErrorMessage(err, "Failed to load dashboard."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const departments = new Set(
    users.map((u) => u.department?.trim()).filter(Boolean),
  ).size;

  return (
    <>
      <WelcomeBanner
        title="Admin Dashboard"
        subtitle="Overview of organization activity."
      />

      {loading ? (
        <LoadingState label="Loading dashboard…" />
      ) : error ? (
        <ErrorState
          title="Couldn't load dashboard"
          description={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Users" value={users.length} icon={Users} />
            <StatCard label="Projects" value={projects.length} icon={Briefcase} />
            <StatCard label="Tasks" value={tasks.length} icon={ClipboardList} />
            <StatCard
              label="Departments"
              value={departments}
              icon={Building2}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
              <RecentUsersList users={users} />
            </SectionCard>

            <SectionCard
              title="Department Overview"
              description="Headcount by department."
              actions={
                <Link
                  to="/admin/departments"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Details
                </Link>
              }
            >
              <DepartmentDistribution users={users} />
            </SectionCard>
          </div>
        </div>
      )}
    </>
  );
}
