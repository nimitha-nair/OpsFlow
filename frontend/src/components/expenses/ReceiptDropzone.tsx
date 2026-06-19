import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { toast } from "sonner";

import {
  ACCEPTED_MIME,
  MAX_FILES,
  validateFiles,
} from "./receipt-dropzone.utils";

interface ReceiptDropzoneProps {
  files: File[];
  onChange: (files: File[]) => void;
  max?: number;
  disabled?: boolean;
  /** Optional id on the hidden file input so an external <label> can open it. */
  inputId?: string;
}

/**
 * Multi-file receipt picker: drag-and-drop or click-to-browse, with a staged
 * file list (image thumbnails / PDF icon) and per-file removal. Validation and
 * caps live in receipt-dropzone.utils so they can be unit-tested.
 */
export function ReceiptDropzone({
  files,
  onChange,
  max = MAX_FILES,
  disabled = false,
  inputId,
}: ReceiptDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Object URLs for image thumbnails, aligned to `files` by index. Revoked when
  // the set changes (or on unmount) by the cleanup effect below.
  const previews = useMemo(
    () =>
      files.map((f) =>
        f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
      ),
    [files],
  );

  useEffect(() => {
    return () => {
      previews.forEach((u) => u && URL.revokeObjectURL(u));
    };
  }, [previews]);

  function add(incoming: File[]) {
    if (disabled) return;
    const { accepted, errors } = validateFiles(incoming, files.length);
    errors.forEach((e) => toast.error(e));
    if (accepted.length) onChange([...files, ...accepted]);
  }

  function remove(idx: number) {
    onChange(files.filter((_, i) => i !== idx));
  }

  const full = files.length >= max;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={disabled || full ? -1 : 0}
        aria-disabled={disabled || full}
        onClick={() => !disabled && !full && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled && !full) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !full) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(Array.from(e.dataTransfer.files));
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition ${
          full || disabled
            ? "cursor-not-allowed border-muted-foreground/20 opacity-60"
            : dragging
              ? "border-[var(--x-primary)] bg-ai-soft"
              : "cursor-pointer border-muted-foreground/25 hover:border-[var(--x-primary)]/60"
        }`}
      >
        <Upload className="size-6 text-ai" />
        <p className="text-sm font-medium text-foreground">
          {full
            ? `Maximum of ${max} files reached`
            : "Drag & drop receipts, or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground">
          JPG, PNG, WEBP, or PDF · max 5 MB each · up to {max} files
        </p>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={ACCEPTED_MIME.join(",")}
        className="hidden"
        onChange={(e) => {
          add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      {files.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${f.size}-${i}`}
              className="relative flex items-center gap-2 rounded-md border bg-muted/30 p-2"
            >
              {previews[i] ? (
                <img
                  src={previews[i] ?? undefined}
                  alt=""
                  className="size-10 shrink-0 rounded object-cover"
                />
              ) : (
                <FileText className="size-10 shrink-0 p-1 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate text-xs" title={f.name}>
                {f.name}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${f.name}`}
                className="rounded p-1 text-muted-foreground transition hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
