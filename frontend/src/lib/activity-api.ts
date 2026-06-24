import { api } from "./api";
import { apiErrorMessage } from "./users-api";
import type { ActivityEvent } from "../types/activity";

/**
 * GET /activity — the unified activity timeline. Staff get organization-wide
 * activity; employees get their own. `limit` caps the number of events.
 * Pass `params.from`/`params.to` (ISO strings) to filter by event timestamp.
 */
export async function listActivity(
  limit?: number,
  params?: { from?: string; to?: string },
): Promise<ActivityEvent[]> {
  const { data } = await api.get<{ data: ActivityEvent[] }>("/activity", {
    params: { ...(limit ? { limit } : {}), ...params },
  });
  return data.data;
}

export { apiErrorMessage };
