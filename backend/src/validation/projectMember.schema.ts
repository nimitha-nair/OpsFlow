import { z } from "zod";

import { firestoreId } from "./common";

/** Params for routes scoped to a project: /projects/:projectId/members */
export const projectIdParams = z.object({ projectId: firestoreId });

/** Params for a specific membership: /projects/:projectId/members/:userId */
export const memberParams = z.object({
  projectId: firestoreId,
  userId: firestoreId,
});

/** POST /projects/:projectId/members body */
export const assignMemberBody = z
  .object({ userId: firestoreId })
  .strict();

export type AssignMemberInput = z.infer<typeof assignMemberBody>;
