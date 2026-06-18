import { z } from "zod";

import UserRole from "../types/roles";
import { PROJECT_STATUSES } from "../types/project.types";

/** Role enum, transformed to the UserRole type the services expect. */
export const roleSchema = z
  .enum(["ADMIN", "HR", "EMPLOYEE"])
  .transform((v) => v as UserRole);

/** Project status enum (matches the ProjectStatus union exactly). */
export const projectStatusSchema = z.enum(PROJECT_STATUSES);

/** A string that parses to a valid date (accepts YYYY-MM-DD and ISO). */
export const dateString = z
  .string()
  .trim()
  .refine((s) => s !== "" && !Number.isNaN(Date.parse(s)), {
    message: "must be a valid date (e.g. YYYY-MM-DD)",
  });

/**
 * A safe Firestore document id. Critically prevents path traversal: a value
 * containing "/" would change which document/collection is addressed, so it is
 * rejected. Also blocks Firestore's reserved id patterns.
 */
export const firestoreId = z
  .string()
  .min(1, "id is required")
  .max(1500, "id is too long")
  .refine((s) => !s.includes("/"), { message: "id must not contain '/'" })
  .refine((s) => s !== "." && s !== "..", { message: "invalid id" })
  .refine((s) => !/^__.*__$/.test(s), { message: "id uses a reserved pattern" });

/** Standard `:id` route-params schema. */
export const idParams = z.object({ id: firestoreId });

export type IdParams = z.infer<typeof idParams>;

/**
 * Validation for any user-supplied URL. Restricts to http(s) to avoid
 * javascript:, data:, file: and similar dangerous schemes. Not currently used
 * by any endpoint (no request field accepts a URL), but provided so future
 * URL inputs are validated consistently.
 */
export const httpUrl = z
  .string()
  .trim()
  .url()
  .refine(
    (value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "must be an http(s) URL" },
  );

/** Pagination query params — lenient: invalid/missing values fall back. */
export const pageQuery = z.coerce.number().int().positive().catch(1);
export const limitQuery = z.coerce.number().int().min(1).max(100).catch(20);

/** Optional free-text search; empty/invalid values become "no filter". */
export const optionalSearch = z
  .string()
  .trim()
  .min(1)
  .optional()
  .catch(undefined);

/**
 * Optional short free-text field (e.g. department, position). Trimmed, capped
 * at 100 chars; blank/whitespace-only values are normalized to "unset".
 */
export const optionalShortText = z
  .string()
  .trim()
  .max(100, "must be at most 100 characters")
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));
