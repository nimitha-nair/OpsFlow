import { UserRound } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "../common/EmptyState";
import { formatDate } from "../../lib/format";
import type { User } from "../../types/user";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
}

interface RecentUsersListProps {
  users: User[];
  limit?: number;
  emptyText?: string;
}

export function RecentUsersList({
  users,
  limit = 5,
  emptyText = "No users yet.",
}: RecentUsersListProps) {
  const recent = [...users]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);

  if (recent.length === 0) {
    return (
      <EmptyState compact icon={UserRound} title="Nothing here yet" description={emptyText} />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {recent.map((user) => (
        <li key={user.id} className="flex items-center gap-3">
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {user.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user.position || user.email}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant="secondary">{user.role}</Badge>
            <span className="text-xs text-muted-foreground">
              {formatDate(user.createdAt)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
