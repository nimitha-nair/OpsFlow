import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "../../context/auth-context";
import { apiErrorMessage } from "../../lib/users-api";
import {
  deleteTaskAttachment,
  fetchTaskAttachmentObjectUrl,
  listTaskAttachments,
  uploadTaskAttachment,
} from "../../lib/task-attachments-api";
import type { TaskAttachment } from "../../types/taskAttachment";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function TaskAttachments({ taskId }: { taskId: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<TaskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const a = await listTaskAttachments(taskId);
        if (!cancelled) setItems(a);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const a = await uploadTaskAttachment(taskId, file);
      setItems((prev) => [a, ...prev]);
      toast.success("File attached.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't upload file."));
    } finally {
      setUploading(false);
    }
  }

  async function open(att: TaskAttachment, download: boolean) {
    try {
      const url = await fetchTaskAttachmentObjectUrl(taskId, att.id, download);
      if (download) {
        const a = document.createElement("a");
        a.href = url;
        a.download = att.originalName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(url, "_blank", "noopener");
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't open file."));
    }
  }

  async function remove(att: TaskAttachment) {
    try {
      await deleteTaskAttachment(taskId, att.id);
      setItems((prev) => prev.filter((x) => x.id !== att.id));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't delete file."));
    }
  }

  const canDelete = (att: TaskAttachment) =>
    user?.role === "ADMIN" || att.uploadedBy === user?.id;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Paperclip className="size-4 text-muted-foreground" /> Attachments
          <span className="text-xs font-normal text-muted-foreground">
            ({items.length})
          </span>
        </div>
        <Button
          size="xs"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
          Attach
        </Button>
        <input ref={inputRef} type="file" className="hidden" onChange={onPick} />
      </div>

      {loading ? null : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No attachments yet — images, PDFs, and documents up to 10 MB.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((att) => (
            <li
              key={att.id}
              className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5"
            >
              {att.mimeType.startsWith("image/") ? (
                <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="size-4 shrink-0 text-muted-foreground" />
              )}
              <button
                type="button"
                onClick={() => open(att, false)}
                className="min-w-0 flex-1 truncate text-left text-sm text-foreground hover:underline"
                title={att.originalName}
              >
                {att.originalName}
              </button>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {formatBytes(att.size)}
              </span>
              <button
                type="button"
                onClick={() => open(att, true)}
                aria-label="Download"
                className="-m-1 shrink-0 p-1 text-muted-foreground hover:text-foreground"
              >
                <Download className="size-3.5" />
              </button>
              {canDelete(att) && (
                <button
                  type="button"
                  onClick={() => remove(att)}
                  aria-label="Delete"
                  className="-m-1 shrink-0 p-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
