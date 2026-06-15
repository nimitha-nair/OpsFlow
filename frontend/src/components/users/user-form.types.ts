import type { Role } from "../../types/auth";

export interface UserFormValues {
  name: string;
  email: string;
  password: string;
  role: Role;
  department: string;
  isActive: boolean;
}

export const emptyUserForm: UserFormValues = {
  name: "",
  email: "",
  password: "",
  role: "EMPLOYEE",
  department: "",
  isActive: true,
};
