import { Building2 } from "lucide-react";

import { EmptyState } from "../common/EmptyState";
import type { User } from "../../types/user";

/** Count users per department (label "No department" for those without one). */
function departmentCounts(
  users: User[],
): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const u of users) {
    const key = u.department?.trim() || "No department";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

interface DepartmentDistributionProps {
  users: User[];
}

export function DepartmentDistribution({ users }: DepartmentDistributionProps) {
  const rows = departmentCounts(users);
  const max = Math.max(1, ...rows.map((r) => r.count));

  if (users.length === 0) {
    return (
      <EmptyState
        compact
        icon={Building2}
        title="No data yet"
        description="Department breakdown will appear here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.name} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate text-foreground">{row.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {row.count}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
