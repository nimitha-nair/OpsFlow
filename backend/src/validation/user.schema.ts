import { z } from "zod";

import {
  limitQuery,
  optionalSearch,
  optionalShortText,
  pageQuery,
  roleSchema,
} from "./common";

/** POST /users */
export const createUserBody = z
  .object({
    name: z.string().trim().min(1),
    email: z.string().trim().email(),
    password: z.string().min(8),
    role: roleSchema,
    department: optionalShortText,
    position: optionalShortText,
    isActive: z.boolean().optional(),
  })
  .strict();

/** PATCH /users/:id */
export const updateUserBody = z
  .object({
    name: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
    role: roleSchema.optional(),
    department: optionalShortText,
    position: optionalShortText,
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update",
  });

/** PATCH /users/:id/status */
export const userStatusBody = z
  .object({ isActive: z.boolean() })
  .strict();

/** GET /users */
export const listUsersQuery = z.object({
  page: pageQuery,
  limit: limitQuery,
  search: optionalSearch,
  role: roleSchema.optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export type CreateUserInput = z.infer<typeof createUserBody>;
export type UpdateUserInput = z.infer<typeof updateUserBody>;
export type UserStatusInput = z.infer<typeof userStatusBody>;
export type ListUsersInput = z.infer<typeof listUsersQuery>;
