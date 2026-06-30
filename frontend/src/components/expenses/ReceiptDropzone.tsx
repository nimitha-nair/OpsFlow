import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, FileText, ImagePlus, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import {
  ACCEPTED_MIME,
  compressImage,
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

/** Human-readable file size (KB / MB). */
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Multi-file receipt picker. On phones it leads with **Take photo** (camera) and
 * **Choose files** buttons; on larger screens it shows the drag-and-drop zone.
 * Big images are compressed client-side before validating (see
 * receipt-dropzone.utils) so mobile captures upload quickly without losing OCR
 * quality.
 */
export function ReceiptDropzone({
  files,
  onChange,
  max = MAX_FILES,
  disabled = false,
  inputId,
}: ReceiptDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
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

  async function add(incoming: File[]) {
    if (disabled || incoming.length === 0) return;
    setBusy(true);
    try {
      // Compress large photos before validating so big mobile captures fit the
      // size cap and upload reliably on slow connections.
      const prepared = await Promise.all(incoming.map((f) => compressImage(f)));
      const { accepted, errors } = validateFiles(prepared, files.length, max);
      errors.forEach((e) => toast.error(e));
      if (accepted.length) onChange([...files, ...accepted]);
    } finally {
      setBusy(false);
    }
  }

  function remove(idx: number) {
    onChange(files.filter((_, i) => i !== idx));
  }

  const full = files.length >= max;
  const blocked = disabled || full || busy;

  return (
    <div className="flex flex-col gap-3">
      {/* Mobile-first: clear Take photo / Choose actions with big touch targets. */}
      <div className="grid grid-cols-2 gap-2 sm:hidden">
        <button
          type="button"
          disabled={blocked}
          onClick={() => cameraRef.current?.click()}
          className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/25 text-sm font-medium text-foreground transition active:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Camera className="size-6 text-ai" />
          Take photo
        </button>
        <button
          type="button"
          disabled={blocked}
          onClick={() => inputRef.current?.click()}
          className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/25 text-sm font-medium text-foreground transition active:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ImagePlus className="size-6 text-ai" />
          Choose files
        </button>
      </div>

      {/* Desktop: drag-and-drop zone. */}
      <div
        role="button"
        tabIndex={blocked ? -1 : 0}
        aria-disabled={blocked}
        onClick={() => !blocked && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !blocked) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!blocked) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void add(Array.from(e.dataTransfer.files));
        }}
        className={`hidden flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition sm:flex ${
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
      </div>

      <p className="text-xs text-muted-foreground">
        JPG, PNG, WEBP, or PDF · max 5 MB each · up to {max} files. Photos are
        optimized automatically before upload.
      </p>

      {busy && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Optimizing image…
        </p>
      )}

      {/* Choose-files input (any accepted type, multiple). */}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={ACCEPTED_MIME.join(",")}
        className="hidden"
        onChange={(e) => {
          void add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      {/* Camera input — opens the rear camera directly on mobile. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      {files.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs" title={f.name}>
                  {f.name}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {fmtSize(f.size)}
                </span>
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
