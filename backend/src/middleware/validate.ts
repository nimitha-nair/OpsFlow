import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodTypeAny } from "zod";

export interface RequestSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

const PARTS = ["body", "params", "query"] as const;

/**
 * Validate request `body`, `params`, and/or `query` against Zod schemas.
 *
 * On success, the parsed (and type-coerced) values are attached to `req.valid`
 * so controllers consume only validated data. On failure, responds 400 with a
 * consistent shape: `{ error: "Validation failed", details: [{ field, message }] }`.
 *
 * Note: parsed values are stored on `req.valid` rather than reassigning
 * `req.query`/`req.params`, which are read-only getters in Express 5.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const details: { field: string; message: string }[] = [];
    const valid: { body?: unknown; params?: unknown; query?: unknown } = {};

    for (const part of PARTS) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part]);
      if (result.success) {
        valid[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          const path = issue.path.length ? issue.path.join(".") : "(root)";
          details.push({ field: `${part}.${path}`, message: issue.message });
        }
      }
    }

    if (details.length > 0) {
      res.status(400).json({ error: "Validation failed", details });
      return;
    }

    req.valid = valid;
    next();
  };
}
