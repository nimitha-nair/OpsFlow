import { useState } from "react";
import {
  ChevronDown,
  ClipboardList,
  LifeBuoy,
  LogOut,
  Menu,
  Plus,
  Receipt,
  Briefcase,
  User,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { ThemeToggle } from "./ThemeToggle";
import { NotificationBell } from "./NotificationBell";
import { GlobalSearch } from "./GlobalSearch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuickCreateTaskDialog } from "../tasks/QuickCreateTaskDialog";
import { useAuth } from "../../context/auth-context";

function initialsOf(name: string | undefined): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "U";
}

interface AppTopbarProps {
  onMenuClick: () => void;
}

export function AppTopbar({ onMenuClick }: AppTopbarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [taskOpen, setTaskOpen] = useState(false);

  const role = user?.role;
  const isAdmin = role === "ADMIN";
  const isEmployee = role === "EMPLOYEE";
  // Role-aware "create" shortcuts surfaced from the global header.
  const newActions =
    isAdmin
      ? [
          { label: "New Task", icon: ClipboardList, onSelect: () => setTaskOpen(true) },
          { label: "New Project", icon: Briefcase, onSelect: () => navigate("/admin/projects/new") },
        ]
      : isEmployee
        ? [
            { label: "New Expense", icon: Receipt, onSelect: () => navigate("/employee/expenses/new") },
            { label: "New Ticket", icon: LifeBuoy, onSelect: () => navigate("/employee/helpdesk") },
          ]
        : [];

  function handleLogout() {
    // Clear auth state + storage, then redirect imperatively. Doing the
    // navigation here (rather than relying on a declarative <Navigate> during
    // re-render) guarantees the redirect even as the menu/portal unmounts.
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-1.5">
        {newActions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button size="sm" className="gap-1.5">
                <Plus className="size-4" />
                <span className="hidden sm:inline">New</span>
                <ChevronDown className="size-3.5 opacity-80" />
              </Button>
            } />
            <DropdownMenuContent align="end" className="w-48">
              {newActions.map((action) => {
                const Icon = action.icon;
                return (
                  <DropdownMenuItem key={action.label} onClick={action.onSelect}>
                    <Icon className="size-4" />
                    {action.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <NotificationBell />
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg p-1 pr-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                {initialsOf(user?.name)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden leading-tight sm:block">
              <span className="block text-sm font-medium text-foreground">
                {user?.name ?? "User"}
              </span>
              <span className="block text-xs text-muted-foreground">
                {user?.role ?? ""}
              </span>
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                {user?.email ?? "Signed in"}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/profile")}>
              <User className="size-4" />
              My Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isAdmin && (
        <QuickCreateTaskDialog open={taskOpen} onOpenChange={setTaskOpen} />
      )}
    </header>
  );
}
