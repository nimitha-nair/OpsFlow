import type { Timestamp } from "firebase-admin/firestore";

export const NOTIFICATION_TYPES = [
  "TASK_ASSIGNED",
  "TASK_UPDATED",
  "TASK_STATUS",
  "TASK_DUE_DATE",
  "COMMENT",
  "REPLY",
  "MENTION",
  "TICKET_UPDATE",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** A notification as stored in Firestore (collection: notifications). */
export interface NotificationDocument {
  id: string;
  /** Recipient user id. */
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Deep-link context. */
  taskId?: string;
  ticketId?: string;
  read: boolean;
  createdAt: Timestamp;
}

/** Client-facing notification; timestamp serialized to ISO-8601. */
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  taskId?: string;
  ticketId?: string;
  read: boolean;
  createdAt: string;
}
