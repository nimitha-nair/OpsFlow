export type NotificationType =
  | "TASK_ASSIGNED"
  | "TASK_UPDATED"
  | "TASK_STATUS"
  | "TASK_DUE_DATE"
  | "COMMENT"
  | "REPLY"
  | "MENTION"
  | "TICKET_UPDATE";

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
