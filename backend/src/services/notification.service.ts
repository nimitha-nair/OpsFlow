import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import { ApiError } from "../utils/errors";
import { filterByDateWindow } from "../utils/date-window";
import type {
  Notification,
  NotificationDocument,
  NotificationType,
} from "../types/notification.types";

const NOTIFICATIONS_COLLECTION = "notifications";

function tsIso(value: Timestamp): string {
  return value instanceof Timestamp
    ? value.toDate().toISOString()
    : new Date(0).toISOString();
}

function tsMillis(value: Timestamp): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

function toPublic(n: NotificationDocument): Notification {
  const result: Notification = {
    id: n.id,
    userId: n.userId,
    type: n.type,
    title: n.title,
    body: n.body,
    read: n.read ?? false,
    createdAt: tsIso(n.createdAt),
  };
  if (n.taskId !== undefined) result.taskId = n.taskId;
  if (n.ticketId !== undefined) result.ticketId = n.ticketId;
  return result;
}

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  taskId?: string;
  ticketId?: string;
}

/** Create one notification. */
export async function createNotification(
  userId: string,
  input: NotifyInput,
): Promise<void> {
  const data: Record<string, unknown> = {
    userId,
    type: input.type,
    title: input.title,
    body: input.body,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  };
  if (input.taskId) data.taskId = input.taskId;
  if (input.ticketId) data.ticketId = input.ticketId;
  await db.collection(NOTIFICATIONS_COLLECTION).add(data);
}

/**
 * Best-effort fan-out to several recipients. Falsy ids are dropped and the list
 * is de-duplicated; failures are swallowed so a notification never breaks the
 * action that triggered it. Pass the actor's id in `exclude` to avoid
 * self-notifying.
 */
export async function notify(
  recipients: (string | undefined | null)[],
  input: NotifyInput,
  exclude?: string,
): Promise<void> {
  const unique = [
    ...new Set(recipients.filter((r): r is string => Boolean(r) && r !== exclude)),
  ];
  await Promise.all(
    unique.map((uid) => createNotification(uid, input).catch(() => {})),
  );
}

/** List a user's notifications, newest first (sorted in memory).
 *  Optional `from`/`to` (ISO strings) filter by `createdAt` before sorting and
 *  applying the limit, so the limit applies to the date-scoped set. */
export async function listForUser(
  userId: string,
  limit = 40,
  from?: string,
  to?: string,
): Promise<Notification[]> {
  const snap = await db
    .collection(NOTIFICATIONS_COLLECTION)
    .where("userId", "==", userId)
    .get();
  let rows: NotificationDocument[] = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<NotificationDocument, "id">),
  }));
  rows = filterByDateWindow(rows, (r) => r.createdAt, from, to);
  rows.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
  return rows.slice(0, limit).map(toPublic);
}

/** Count of unread notifications for a user (global — not date-filtered). */
export async function countUnread(userId: string): Promise<number> {
  const snap = await db
    .collection(NOTIFICATIONS_COLLECTION)
    .where("userId", "==", userId)
    .where("read", "==", false)
    .get();
  return snap.size;
}

/** Mark a single notification read (must belong to the user). */
export async function markRead(id: string, userId: string): Promise<void> {
  const ref = db.collection(NOTIFICATIONS_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists || (snap.data()?.userId as string) !== userId) {
    throw new ApiError(404, "Notification not found");
  }
  await ref.update({ read: true });
}

/** Mark all of a user's unread notifications read. Returns how many. */
export async function markAllRead(userId: string): Promise<number> {
  const snap = await db
    .collection(NOTIFICATIONS_COLLECTION)
    .where("userId", "==", userId)
    .get();
  const unread = snap.docs.filter((d) => d.get("read") !== true);
  let batch = db.batch();
  let ops = 0;
  for (const doc of unread) {
    batch.update(doc.ref, { read: true });
    ops += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return unread.length;
}
