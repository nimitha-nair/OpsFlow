import { z } from "zod";

import {
  dateRangeQuery,
  dateString,
  limitQuery,
  optionalSearch,
  pageQuery,
  projectStatusSchema,
} from "./common";

/** POST /projects */
export const createProjectBody = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    clientName: z.string().trim().min(1),
    budget: z.number().finite().nonnegative(),
    status: projectStatusSchema.default("PLANNING"),
    startDate: dateString,
    endDate: dateString,
  })
  .strict()
  .refine((v) => Date.parse(v.endDate) >= Date.parse(v.startDate), {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });

/** PATCH /projects/:id */
export const updateProjectBody = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    clientName: z.string().trim().min(1).optional(),
    budget: z.number().finite().nonnegative().optional(),
    status: projectStatusSchema.optional(),
    startDate: dateString.optional(),
    endDate: dateString.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update",
  })
  .refine(
    (v) =>
      !(v.startDate && v.endDate) ||
      Date.parse(v.endDate) >= Date.parse(v.startDate),
    { message: "endDate must be on or after startDate", path: ["endDate"] },
  );

/** GET /projects */
export const listProjectsQuery = z
  .object({
    page: pageQuery,
    limit: limitQuery,
    search: optionalSearch,
    status: projectStatusSchema.optional(),
  })
  .merge(dateRangeQuery);

export type CreateProjectInput = z.infer<typeof createProjectBody>;
export type UpdateProjectInput = z.infer<typeof updateProjectBody>;
export type ListProjectsInput = z.infer<typeof listProjectsQuery>;
