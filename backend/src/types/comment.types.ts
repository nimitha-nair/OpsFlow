import type { Timestamp } from "firebase-admin/firestore";

/** A task comment as stored in Firestore (collection: taskComments). */
export interface CommentDocument {
  id: string;
  taskId: string;
  authorId: string;
  /** Denormalized author display name (snapshot at creation). */
  authorName: string;
  body: string;
  /** When set, this comment is a reply to another comment. */
  parentId?: string;
  /** User ids mentioned in the body (drives mention notifications). */
  mentions: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Client-facing comment; timestamps serialized to ISO-8601. */
export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  authorName: string;
  body: string;
  parentId?: string;
  mentions: string[];
  createdAt: string;
  updatedAt: string;
}
