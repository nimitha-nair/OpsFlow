import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera,
  CheckCircle2,
  FileText,
  ImagePlus,
  Loader2,
  Sparkles,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { useAuth } from "../../context/auth-context";
import { expensesBasePath } from "../../lib/permissions";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "../../components/layout/PageHeader";
import { ScopeSelector } from "../../components/expenses/ScopeSelector";
import {
  ACCEPTED_MIME,
  compressImage,
} from "../../components/expenses/receipt-dropzone.utils";
import { listMyProjects } from "../../lib/projects-api";
import { apiErrorMessage, bulkCreateDrafts } from "../../lib/expenses-api";
import {
  analyzeExpense,
  getExpenseAnalysis,
} from "../../lib/expense-analysis-api";
import { isTerminalStatus } from "../../types/expenseAnalysis";
import type { ExpenseScope } from "../../types/expense";
import type { Project } from "../../types/project";

const MAX_BULK_FILES = 15;
const POLL_MS = 2000;
const CHUNK_SIZE = 3;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

type BulkRowStatus = "queued" | "analyzing" | "ready" | "failed";

interface BulkRow {
  fileIdx: number;
  name: string;
  status: BulkRowStatus;
  error?: string;
  expenseId?: string;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Trigger analysis for one expense draft and poll until a terminal status is
 * reached (COMPLETED, LOW_CONFIDENCE, or FAILED).
 */
async function analyzeDraftWithPolling(expenseId: string): Promise<void> {
  const started = await analyzeExpense(expenseId);
  if (isTerminalStatus(started.status)) return;
  await new Promise<void>((resolve) => {
    const timer = window.setInterval(async () => {
      try {
        const current = await getExpenseAnalysis(expenseId);
        if (current && isTerminalStatus(current.status)) {
          window.clearInterval(timer);
          resolve();
        }
      } catch {
        window.clearInterval(timer);
        resolve();
      }
    }, POLL_MS);
  });
}

// ---------------------------------------------------------------------------
// BulkDropzone — multi-file picker supporting up to MAX_BULK_FILES (15) files.
// Visual style matches ReceiptDropzone; uses the same utils for MIME/size checks
// and client-side image compression, but removes the 5-file cap from the shared
// validateFiles helper so the bulk flow can accept the full 15.
// ---------------------------------------------------------------------------
function BulkDropzone({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [compressing, setCompressing] = useState(false);

  const full = files.length >= MAX_BULK_FILES;
  const blocked = disabled || compressing;

  async function add(incoming: File[]) {
    if (blocked || full || incoming.length === 0) return;
    setCompressing(true);
    try {
      const valid: File[] = [];
      for (const f of incoming) {
        if (!ACCEPTED_MIME.includes(f.type)) {
          toast.error(`${f.name}: unsupported type`);
          continue;
        }
        if (f.size > MAX_BYTES) {
          toast.error(`${f.name}: too large (max 5 MB)`);
          continue;
        }
        valid.push(f);
      }
      if (valid.length === 0) return;
      const prepared = await Promise.all(valid.map((f) => compressImage(f)));
      const next = [...files, ...prepared];
      if (next.length > MAX_BULK_FILES) {
        toast.error(
          `Only ${MAX_BULK_FILES} files are allowed — excess files removed.`,
        );
        onChange(next.slice(0, MAX_BULK_FILES));
      } else {
        onChange(next);
      }
    } finally {
      setCompressing(false);
    }
  }

  function remove(idx: number) {
    onChange(files.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Mobile: large touch targets for Take photo / Choose files */}
      <div className="grid grid-cols-2 gap-2 sm:hidden">
        <button
          type="button"
          disabled={blocked || full}
          onClick={() => cameraRef.current?.click()}
          className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/25 text-sm font-medium text-foreground transition active:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Camera className="size-6 text-ai" />
          Take photo
        </button>
        <button
          type="button"
          disabled={blocked || full}
          onClick={() => inputRef.current?.click()}
          className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/25 text-sm font-medium text-foreground transition active:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ImagePlus className="size-6 text-ai" />
          Choose files
        </button>
      </div>

      {/* Desktop: drag-and-drop zone */}
      <div
        role="button"
        tabIndex={blocked || full ? -1 : 0}
        aria-disabled={blocked || full}
        onClick={() => !(blocked || full) && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !(blocked || full)) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!(blocked || full)) setDragging(true);
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
            ? `Maximum of ${MAX_BULK_FILES} files reached`
            : "Drag & drop receipts, or click to browse"}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        JPG, PNG, WEBP, or PDF · max 5 MB each · up to {MAX_BULK_FILES} files.
        Each file becomes a separate AI-analyzed draft.
      </p>

      {compressing && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Optimizing images…
        </p>
      )}

      {/* Hidden inputs */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_MIME.join(",")}
        className="hidden"
        onChange={(e) => {
          void add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
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

      {/* File list */}
      {files.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${f.size}-${i}`}
              className="relative flex items-center gap-2 rounded-md border bg-muted/30 p-2"
            >
              <FileText className="size-10 shrink-0 p-1 text-muted-foreground" />
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
                disabled={disabled}
                aria-label={`Remove ${f.name}`}
                className="rounded p-1 text-muted-foreground transition hover:text-destructive disabled:opacity-50"
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

// ---------------------------------------------------------------------------
// BulkRowItem — one row in the per-file progress list.
// ---------------------------------------------------------------------------
function BulkRowItem({ row }: { row: BulkRow }) {
  return (
    <li className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
      {row.status === "queued" && (
        <span className="size-4 shrink-0 rounded-full border-2 border-muted-foreground/40" />
      )}
      {row.status === "analyzing" && (
        <Loader2 className="size-4 shrink-0 animate-spin text-ai" />
      )}
      {row.status === "ready" && (
        <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
      )}
      {row.status === "failed" && (
        <XCircle className="size-4 shrink-0 text-destructive" />
      )}
      <span className="min-w-0 flex-1 truncate font-medium" title={row.name}>
        {row.name}
      </span>
      <span className="shrink-0 text-xs capitalize text-muted-foreground">
        {row.status === "queued"
          ? "Queued"
          : row.status === "analyzing"
            ? "Analyzing…"
            : row.status === "ready"
              ? "Ready"
              : (row.error ?? "Failed")}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// BulkUploadPage — the main page.
// ---------------------------------------------------------------------------
export function BulkUploadPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const base = user ? expensesBasePath(user.role) : "/employee/expenses";

  const [projects, setProjects] = useState<Project[]>([]);
  const [scope, setScope] = useState<ExpenseScope>("GENERAL");
  const [projectId, setProjectId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMyProjects().then(setProjects).catch(() => undefined);
  }, []);

  async function handleUploadAndAnalyze() {
    if (files.length === 0) return;
    setBusy(true);
    setDone(false);
    setError(null);

    // Initialise a queued row for every file.
    const initialRows: BulkRow[] = files.map((f, i) => ({
      fileIdx: i,
      name: f.name,
      status: "queued",
    }));
    setRows(initialRows);

    try {
      const result = await bulkCreateDrafts(files, {
        scope,
        projectId: scope === "PROJECT" && projectId ? projectId : undefined,
      });

      // Match each original file to a created expense or a failure.
      // We consume the failed[] list by name so duplicate file names are handled.
      const failedQueue = [...result.failed];
      const rowUpdates = new Map<number, Partial<BulkRow>>();
      let createdIdx = 0;

      files.forEach((f, idx) => {
        const failedPos = failedQueue.findIndex((fq) => fq.fileName === f.name);
        if (failedPos !== -1) {
          rowUpdates.set(idx, {
            status: "failed",
            error: failedQueue[failedPos].error,
          });
          failedQueue.splice(failedPos, 1);
        } else if (createdIdx < result.created.length) {
          rowUpdates.set(idx, {
            status: "analyzing",
            expenseId: result.created[createdIdx].id,
          });
          createdIdx++;
        }
      });

      setRows((prev) =>
        prev.map((r) => {
          const upd = rowUpdates.get(r.fileIdx);
          return upd ? { ...r, ...upd } : r;
        }),
      );

      // Collect the expenses that need analysis.
      const toAnalyze = [...rowUpdates.entries()]
        .filter(([, upd]) => upd.status === "analyzing" && upd.expenseId)
        .map(([fileIdx, upd]) => ({ fileIdx, expenseId: upd.expenseId! }));

      // Process in chunks of CHUNK_SIZE (concurrency limit = 3).
      for (let i = 0; i < toAnalyze.length; i += CHUNK_SIZE) {
        const chunk = toAnalyze.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async ({ fileIdx, expenseId }) => {
            try {
              await analyzeDraftWithPolling(expenseId);
              setRows((prev) =>
                prev.map((r) =>
                  r.fileIdx === fileIdx ? { ...r, status: "ready" } : r,
                ),
              );
            } catch {
              setRows((prev) =>
                prev.map((r) =>
                  r.fileIdx === fileIdx
                    ? { ...r, status: "failed", error: "Analysis failed" }
                    : r,
                ),
              );
            }
          }),
        );
      }

      setDone(true);
      toast.success("Bulk analysis complete.");
    } catch (err) {
      setError(apiErrorMessage(err, "Bulk upload failed."));
      setRows([]);
    } finally {
      setBusy(false);
    }
  }

  const readyCount = rows.filter((r) => r.status === "ready").length;
  const failedCount = rows.filter((r) => r.status === "failed").length;

  return (
    <div className="expense-scope">
      <PageHeader
        title="Bulk Upload"
        breadcrumbs={[
          { label: "Expenses", to: base },
          { label: "Bulk Upload" },
        ]}
      />

      <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4">
        {/* Step 1 — Scope */}
        <Card>
          <CardContent className="flex flex-col gap-5 pt-6">
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">Where do these belong?</h2>
              <ScopeSelector value={scope} onChange={setScope} disabled={busy} />
            </div>
            {scope === "PROJECT" && (
              <div className="flex flex-col gap-2 sm:max-w-sm">
                <Label htmlFor="bulk-project">Select Project</Label>
                <Select
                  value={projectId}
                  onValueChange={(v) => setProjectId(v ?? "")}
                >
                  <SelectTrigger id="bulk-project" className="w-full">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        You are not assigned to any project
                      </SelectItem>
                    ) : (
                      projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2 — File picker (hidden once done) */}
        {!done && (
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-ai" />
                <h2 className="text-sm font-semibold">
                  Upload receipts (up to {MAX_BULK_FILES})
                </h2>
              </div>
              <BulkDropzone files={files} onChange={setFiles} disabled={busy} />
            </CardContent>
          </Card>
        )}

        {/* Per-file progress */}
        {rows.length > 0 && (
          <Card>
            <CardContent className="flex flex-col gap-2 pt-6">
              <h2 className="mb-1 text-sm font-semibold">Progress</h2>
              <ul className="flex flex-col gap-1.5">
                {rows.map((row) => (
                  <BulkRowItem key={row.fileIdx} row={row} />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Done summary */}
        {done && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm font-medium">
                {readyCount} ready
                {failedCount > 0 ? `, ${failedCount} failed` : ""}.{" "}
                {failedCount > 0
                  ? "Failed drafts were still created and can be reviewed individually."
                  : "Open My Expenses to verify and submit each draft."}
              </p>
            </CardContent>
            <CardFooter className="justify-end pb-6 pt-0">
              <Button
                type="button"
                className="btn-primary"
                onClick={() => navigate(base)}
              >
                Review drafts
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Actions */}
        {!done && (
          <Card>
            <CardFooter className="flex-wrap justify-end gap-2 pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(base)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="btn-primary"
                onClick={handleUploadAndAnalyze}
                disabled={files.length === 0 || busy}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Upload &amp; Analyze
              </Button>
            </CardFooter>
          </Card>
        )}
      </form>
    </div>
  );
}
