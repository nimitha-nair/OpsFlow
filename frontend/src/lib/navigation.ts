import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Receipt,
  Settings,
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
    { label: "Departments", icon: Building2, to: "/admin/departments" },
    { label: "Attendance", icon: CalendarCheck, to: "/admin/attendance" },
    { label: "Leave Management", icon: CalendarDays, to: "/admin/leave" },
    { label: "Payroll", icon: Wallet, to: "/admin/payroll" },
    { label: "Reports", icon: BarChart3, to: "/admin/reports" },
    { label: "Settings", icon: Settings, to: "/admin/settings" },
  ],
  HR: [
    { label: "Dashboard", icon: LayoutDashboard, to: "/hr", end: true },
    { label: "Employees", icon: Users, to: "/hr/employees" },
    { label: "Projects", icon: Briefcase, to: "/hr/projects" },
    { label: "Attendance", icon: CalendarCheck, to: "/hr/attendance" },
    { label: "Leave Management", icon: CalendarDays, to: "/hr/leave" },
    { label: "Payroll", icon: Wallet, to: "/hr/payroll" },
    { label: "Reports", icon: BarChart3, to: "/hr/reports" },
  ],
  EMPLOYEE: [
    { label: "Dashboard", icon: LayoutDashboard, to: "/employee", end: true },
    { label: "My Profile", icon: User, to: "/employee/profile" },
    { label: "My Projects", icon: Briefcase, to: "/employee/projects" },
    { label: "My Tasks", icon: ClipboardList, to: "/employee/tasks" },
    { label: "Attendance", icon: CalendarCheck, to: "/employee/attendance" },
    { label: "Leave Requests", icon: CalendarDays, to: "/employee/leave" },
    { label: "Payslips", icon: Receipt, to: "/employee/payslips" },
  ],
};

/** Human-readable workspace label per role. */
export const roleWorkspaceLabel: Record<Role, string> = {
  ADMIN: "Administrator",
  HR: "Human Resources",
  EMPLOYEE: "Employee",
};
