import { useEffect, useState } from "react";
import { Briefcase, Building2, ClipboardList, Users } from "lucide-react";

import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { SectionCard } from "../../components/common/SectionCard";
import { DepartmentDistribution } from "../../components/dashboard/DepartmentDistribution";
import { RecentUsersList } from "../../components/dashboard/RecentUsersList";
import { StatCard } from "../../components/dashboard/StatCard";
import { TaskStatusSummary } from "../../components/dashboard/TaskStatusSummary";
import { WelcomeBanner } from "../../components/dashboard/WelcomeBanner";
import { listProjects } from "../../lib/projects-api";
import { listTasks } from "../../lib/tasks-api";
import { apiErrorMessage, listUsers } from "../../lib/users-api";
import type { Project } from "../../types/project";
import type { Task } from "../../types/task";
import type { User } from "../../types/user";

export function HrDashboard() {
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

  const employees = users.filter((u) => u.role === "EMPLOYEE");
  const departments = new Set(
    employees.map((u) => u.department?.trim()).filter(Boolean),
  ).size;

  return (
    <>
      <WelcomeBanner
        title="HR Dashboard"
        subtitle="People operations at a glance."
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
            <StatCard label="Employees" value={employees.length} icon={Users} />
            <StatCard label="Projects" value={projects.length} icon={Briefcase} />
            <StatCard label="Tasks" value={tasks.length} icon={ClipboardList} />
            <StatCard
              label="Departments"
              value={departments}
              icon={Building2}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SectionCard
              title="Department Distribution"
              description="Employees per department."
            >
              <DepartmentDistribution users={employees} />
            </SectionCard>

            <SectionCard
              title="Recent Employees"
              description="Newest team members."
            >
              <RecentUsersList
                users={employees}
                emptyText="No employees yet."
              />
            </SectionCard>

            <SectionCard
              title="Task Summary"
              description="Tasks by status across projects."
            >
              <TaskStatusSummary tasks={tasks} />
            </SectionCard>
          </div>
        </div>
      )}
    </>
  );
}
