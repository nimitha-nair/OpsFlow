import UserRole from "./roles";

/**
 * Named capabilities for the expense module. Routes and UI check capabilities
 * instead of raw roles, so "who can do what" lives in one map (ROLE_CAPABILITIES)
 * rather than being scattered across route definitions.
 */
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

/** Single source of truth: which capabilities each role is granted. */
export const ROLE_CAPABILITIES: Record<UserRole, Capability[]> = {
  [UserRole.EMPLOYEE]: [...SELF_SERVICE],
  [UserRole.HR]: [...SELF_SERVICE, "expense:view-all", "expense:review"],
  [UserRole.ADMIN]: [...SELF_SERVICE, "expense:view-all", "expense:reimburse"],
};

/** Whether `role` is granted `cap`. Unknown roles have no capabilities. */
export function hasCapability(role: string, cap: Capability): boolean {
  const caps = ROLE_CAPABILITIES[role as UserRole];
  return caps ? caps.includes(cap) : false;
}
