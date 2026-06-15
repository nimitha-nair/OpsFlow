export type Role = "ADMIN" | "HR" | "EMPLOYEE";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/** Shape returned by the backend POST /auth/login. */
export interface LoginResponse {
  token: string;
  user: AuthUser;
}

/** Map a role to the route a user of that role should land on. */
export function roleHome(role: Role): string {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "HR":
      return "/hr";
    case "EMPLOYEE":
      return "/employee";
  }
}
