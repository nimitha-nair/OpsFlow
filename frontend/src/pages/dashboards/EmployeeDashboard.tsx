import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, CircleCheck, ClipboardList, Clock } from "lucide-react";

import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { SectionCard } from "../../components/common/SectionCard";
import { StatCard } from "../../components/dashboard/StatCard";
import { TaskStatusSummary } from "../../components/dashboard/TaskStatusSummary";
import { WelcomeBanner } from "../../components/dashboard/WelcomeBanner";
import { ProjectStatusBadge } from "../../components/projects/ProjectStatusBadge";
import { DueDate } from "../../components/tasks/DueDate";
import { TaskPriorityBadge } from "../../components/tasks/TaskBadges";
import { listMyProjects } from "../../lib/projects-api";
import { apiErrorMessage, listMyTasks } from "../../lib/tasks-api";
import type { Project } from "../../types/project";
import type { Task } from "../../types/task";

export function EmployeeDashboard() {
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
        const [myTasks, myProjects] = await Promise.all([
          listMyTasks(),
          listMyProjects(),
        ]);
        if (cancelled) return;
        setTasks(myTasks);
        setProjects(myProjects);
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

  const projectName = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const upcoming = useMemo(
    () =>
      [...tasks]
        .filter((t) => t.status !== "DONE")
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 5),
    [tasks],
  );

  return (
    <>
      <WelcomeBanner
        title="Employee Dashboard"
        subtitle="Your projects, tasks, and expenses."
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
            <StatCard label="My Projects" value={projects.length} icon={Briefcase} />
            <StatCard label="My Tasks" value={tasks.length} icon={ClipboardList} />
            <StatCard label="In Progress" value={inProgress} icon={Clock} />
            <StatCard label="Completed" value={done} icon={CircleCheck} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SectionCard
              title="Upcoming Deadlines"
              description="Your nearest open tasks."
              className="lg:col-span-2"
            >
              {upcoming.length === 0 ? (
                <EmptyState
                  compact
                  icon={ClipboardList}
                  title="Nothing due"
                  description="Open tasks assigned to you will appear here."
                />
              ) : (
                <ul className="flex flex-col gap-3">
                  {upcoming.map((task) => (
                    <li
                      key={task.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {task.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {projectName.get(task.projectId) ?? "—"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <TaskPriorityBadge priority={task.priority} />
                        <DueDate dueDate={task.dueDate} status={task.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title="Task Status"
              description="Your task breakdown."
            >
              <TaskStatusSummary tasks={tasks} />
            </SectionCard>
          </div>

          <SectionCard
            title="My Projects"
            description="Projects you are assigned to."
          >
            {projects.length === 0 ? (
              <EmptyState
                compact
                icon={Briefcase}
                title="No projects yet"
                description="Projects you are added to will appear here."
              />
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      to={`/employee/projects/${project.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 hover:bg-muted/50"
                    >
                      <span className="truncate text-sm font-medium text-foreground">
                        {project.name}
                      </span>
                      <ProjectStatusBadge status={project.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      )}
    </>
  );
}
