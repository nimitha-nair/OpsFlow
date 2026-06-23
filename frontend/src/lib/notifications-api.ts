import { api } from "./api";
import type { Notification } from "../types/notification";

/** GET /notifications */
export async function listNotifications(): Promise<{
  data: Notification[];
  unread: number;
}> {
  const { data } = await api.get<{ data: Notification[]; unread: number }>(
    "/notifications",
  );
  return data;
}

/** PATCH /notifications/:id/read */
export async function markNotificationRead(id: string): Promise<void> {
  await api.patch(`/notifications/${id}/read`);
}

/** PATCH /notifications/read-all */
export async function markAllNotificationsRead(): Promise<void> {
  await api.patch("/notifications/read-all");
}
