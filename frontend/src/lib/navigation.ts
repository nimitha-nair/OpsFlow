import {
  Activity,
  BarChart3,
  Briefcase,
  Building2,
  ClipboardCheck,
  ClipboardList,
  HandCoins,
  LayoutDashboard,
  SquareKanban,
  User,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Role } from "../types/auth";

export interface NavItem {
  label: string;
  icon: LucideIcon;
  /** Absolute route path. */
  to: string;
  /** Match only on the exact path (used for the index "Dashboard" link). */
  end?: boolean;
}

/** Base path for each role's section. */
export const roleBasePath: Record<Role, string> = {
  ADMIN: "/admin",
  HR: "/hr",
  EMPLOYEE: "/employee",
};

/** Sidebar navigation per role. */
export const navByRole: Record<Role, NavItem[]> = {
  ADMIN: [
    { label: "Dashboard", icon: LayoutDashboard, to: "/admin", end: true },
    { label: "User Management", icon: Users, to: "/admin/users" },
    { label: "Projects", icon: Briefcase, to: "/admin/projects" },
    { label: "Kanban", icon: SquareKanban, to: "/admin/kanban" },
    { label: "Expenses", icon: Wallet, to: "/admin/expenses" },
    {
      label: "Reimbursements",
      icon: HandCoins,
      to: "/admin/expenses/reimbursements",
    },
    { label: "Departments", icon: Building2, to: "/admin/departments" },
    { label: "Reports", icon: BarChart3, to: "/admin/reports" },
    { label: "Activity", icon: Activity, to: "/admin/activity" },
  ],
  HR: [
    { label: "Dashboard", icon: LayoutDashboard, to: "/hr", end: true },
    { label: "Employees", icon: Users, to: "/hr/employees" },
    { label: "Projects", icon: Briefcase, to: "/hr/projects" },
    { label: "Kanban", icon: SquareKanban, to: "/hr/kanban" },
    { label: "Expenses", icon: Wallet, to: "/hr/expenses" },
    { label: "Reports", icon: BarChart3, to: "/hr/reports" },
    { label: "Activity", icon: Activity, to: "/hr/activity" },
  ],
  EMPLOYEE: [
    { label: "Dashboard", icon: LayoutDashboard, to: "/employee", end: true },
    { label: "My Profile", icon: User, to: "/profile" },
    { label: "My Projects", icon: Briefcase, to: "/employee/projects" },
    { label: "My Tasks", icon: ClipboardList, to: "/employee/tasks" },
    { label: "Kanban", icon: SquareKanban, to: "/employee/kanban" },
    { label: "My Expenses", icon: Wallet, to: "/employee/expenses" },
    { label: "Activity", icon: Activity, to: "/employee/activity" },
  ],
};

/**
 * The 4 primary destinations per role for the mobile bottom navigation bar
 * (a 5th "More" slot opens the full drawer). Kept short and thumb-reachable.
 */
export const bottomNavByRole: Record<Role, NavItem[]> = {
  ADMIN: [
    { label: "Home", icon: LayoutDashboard, to: "/admin", end: true },
    { label: "Kanban", icon: SquareKanban, to: "/admin/kanban" },
    { label: "Expenses", icon: Wallet, to: "/admin/expenses" },
    { label: "Reports", icon: BarChart3, to: "/admin/reports" },
  ],
  HR: [
    { label: "Home", icon: LayoutDashboard, to: "/hr", end: true },
    { label: "Review", icon: ClipboardCheck, to: "/hr/expenses" },
    { label: "People", icon: Users, to: "/hr/employees" },
    { label: "Reports", icon: BarChart3, to: "/hr/reports" },
  ],
  EMPLOYEE: [
    { label: "Home", icon: LayoutDashboard, to: "/employee", end: true },
    { label: "Tasks", icon: ClipboardList, to: "/employee/tasks" },
    { label: "Expenses", icon: Wallet, to: "/employee/expenses" },
    { label: "Activity", icon: Activity, to: "/employee/activity" },
  ],
};

/** Human-readable workspace label per role. */
export const roleWorkspaceLabel: Record<Role, string> = {
  ADMIN: "Administrator",
  HR: "Human Resources",
  EMPLOYEE: "Employee",
};
