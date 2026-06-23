import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquare, Reply, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "../../context/auth-context";
import {
  apiErrorMessage,
  createComment,
  deleteComment,
  listComments,
} from "../../lib/comments-api";
import { listProjectMembers } from "../../lib/project-members-api";
import { extractMentionIds, splitMentions, type MentionMember } from "../../lib/mentions";
import { formatDateTime } from "../../lib/format";
import { AssigneeAvatar } from "../kanban/KanbanCard";
import type { Comment } from "../../types/comment";

interface TaskCommentsProps {
  taskId: string;
  projectId: string;
}

export function TaskComments({ taskId, projectId }: TaskCommentsProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [members, setMembers] = useState<MentionMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const list = await listComments(taskId);
        if (!cancelled) setComments(list);
      } catch {
        if (!cancelled) toast.error("Couldn't load comments.");
      } finally {
        if (!cancelled) setLoading(false);
      }
      try {
        const ms = await listProjectMembers(projectId);
        if (!cancelled) {
          setMembers(
            ms.filter((m) => m.user).map((m) => ({ id: m.userId, name: m.user!.name })),
          );
        }
      } catch {
        /* members are optional (mention resolution only) */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId, projectId]);

  const memberNames = useMemo(() => members.map((m) => m.name), [members]);
  const replies = useMemo(() => {
    const byParent = new Map<string, Comment[]>();
    for (const c of comments) {
      if (c.parentId) {
        const list = byParent.get(c.parentId) ?? [];
        list.push(c);
        byParent.set(c.parentId, list);
      }
    }
    return byParent;
  }, [comments]);
  const topLevel = useMemo(() => comments.filter((c) => !c.parentId), [comments]);

  async function submit() {
    const text = body.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      await createComment(taskId, {
        body: text,
        parentId: replyTo?.id,
        mentions: extractMentionIds(text, members),
      });
      setBody("");
      setReplyTo(null);
      setComments(await listComments(taskId));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't post comment."));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(comment: Comment) {
    try {
      await deleteComment(taskId, comment.id);
      setComments((prev) => prev.filter((c) => c.id !== comment.id && c.parentId !== comment.id));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete comment."));
    }
  }

  const canDelete = (c: Comment) =>
    user?.role === "ADMIN" || c.authorId === user?.id;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <MessageSquare className="size-4 text-muted-foreground" />
        Comments
        <span className="text-xs font-normal text-muted-foreground">
          ({comments.length})
        </span>
      </div>

      <div className="flex max-h-64 flex-col gap-3 overflow-y-auto pr-1">
        {loading ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Loading comments…
          </p>
        ) : topLevel.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No comments yet. Start the discussion.
          </p>
        ) : (
          topLevel.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              replies={replies.get(c.id) ?? []}
              memberNames={memberNames}
              canDelete={canDelete}
              onReply={setReplyTo}
              onDelete={remove}
            />
          ))
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
        {replyTo && (
          <div className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
            <span>Replying to {replyTo.authorName}</span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              aria-label="Cancel reply"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment… use @ to mention a teammate"
          rows={2}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
          }}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={submitting || body.trim() === ""}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {replyTo ? "Reply" : "Comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  replies,
  memberNames,
  canDelete,
  onReply,
  onDelete,
}: {
  comment: Comment;
  replies: Comment[];
  memberNames: string[];
  canDelete: (c: Comment) => boolean;
  onReply: (c: Comment) => void;
  onDelete: (c: Comment) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <CommentRow
        comment={comment}
        memberNames={memberNames}
        canDelete={canDelete}
        onReply={onReply}
        onDelete={onDelete}
      />
      {replies.length > 0 && (
        <div className="ml-7 flex flex-col gap-2 border-l border-border/60 pl-3">
          {replies.map((r) => (
            <CommentRow
              key={r.id}
              comment={r}
              memberNames={memberNames}
              canDelete={canDelete}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  memberNames,
  canDelete,
  onReply,
  onDelete,
}: {
  comment: Comment;
  memberNames: string[];
  canDelete: (c: Comment) => boolean;
  onReply?: (c: Comment) => void;
  onDelete: (c: Comment) => void;
}) {
  const segments = splitMentions(comment.body, memberNames);
  return (
    <div className="flex gap-2">
      <AssigneeAvatar name={comment.authorName} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {comment.authorName}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {formatDateTime(comment.createdAt)}
          </span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">
          {segments.map((s, i) =>
            s.mention ? (
              <span key={i} className="font-medium text-primary">
                {s.text}
              </span>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )}
        </p>
        <div className="mt-0.5 flex items-center gap-3">
          {onReply && (
            <button
              type="button"
              onClick={() => onReply(comment)}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Reply className="size-3" /> Reply
            </button>
          )}
          {canDelete(comment) && (
            <button
              type="button"
              onClick={() => onDelete(comment)}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3" /> Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
