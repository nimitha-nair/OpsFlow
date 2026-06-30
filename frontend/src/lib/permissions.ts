import type { Role } from "../types/auth";

export type Capability =
  | "expense:create"
  | "expense:submit"
  | "expense:bulk-upload"
  | "expense:edit-own"
  | "expense:delete-own"
  | "expense:view-own"
  | "expense:view-all"
  | "expense:review"
  | "expense:reimburse";

const SELF_SERVICE: Capability[] = [
  "expense:create",
  "expense:submit",
  "expense:bulk-upload",
  "expense:edit-own",
  "expense:delete-own",
  "expense:view-own",
];

const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  EMPLOYEE: [...SELF_SERVICE],
  HR: [...SELF_SERVICE, "expense:view-all", "expense:review"],
  ADMIN: [...SELF_SERVICE, "expense:view-all", "expense:reimburse"],
};

/** Whether `role` is granted `cap`. Mirrors the backend ROLE_CAPABILITIES. */
export function can(role: Role | undefined, cap: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role]?.includes(cap) ?? false;
}

/** The route base for a role's own expenses (submission flow lives under this). */
export function expensesBasePath(role: Role): string {
  if (role === "ADMIN") return "/admin/expenses";
  if (role === "HR") return "/hr/expenses";
  return "/employee/expenses";
}
