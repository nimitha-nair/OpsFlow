export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  authorName: string;
  body: string;
  /** Present when this comment is a reply to another. */
  parentId?: string;
  /** User ids mentioned in the body. */
  mentions: string[];
  createdAt: string;
  updatedAt: string;
}
