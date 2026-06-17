import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Save, Send, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/layout/PageHeader";
import { listMyProjects } from "../../lib/projects-api";
import {
  apiErrorMessage,
  createExpense,
  getExpense,
  submitExpense,
  updateExpense,
  uploadExpenseDocument,
} from "../../lib/expenses-api";
import {
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  EXPENSE_SCOPES,
  EXPENSE_TYPES,
  SCOPE_LABELS,
  TYPE_LABELS,
  type CreateExpensePayload,
  type ExpenseCategory,
  type ExpenseScope,
  type ExpenseType,
} from "../../types/expense";
import type { Project } from "../../types/project";

const ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf";

export function SubmitExpensePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [scope, setScope] = useState<ExpenseScope>("PROJECT");
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState<ExpenseType>("CASH");
  const [category, setCategory] = useState<ExpenseCategory>("TRAVEL");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [hasDocument, setHasDocument] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "done" | "error"
  >("idle");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const mine = await listMyProjects();
        if (cancelled) return;
        setProjects(mine);

        if (isEdit && id) {
          const expense = await getExpense(id);
          if (cancelled) return;
          if (
            expense.approvalStatus !== "DRAFT" &&
            expense.approvalStatus !== "REJECTED"
          ) {
            setLoadError("Only draft or rejected expenses can be edited.");
            return;
          }
          setScope(expense.scope);
          setProjectId(expense.projectId ?? "");
          setType(expense.type);
          setCategory(expense.category);
          setAmount(String(expense.amount));
          setExpenseDate(expense.expenseDate);
          setDescription(expense.description);
          setHasDocument(Boolean(expense.documentId));
        }
      } catch (err) {
        if (!cancelled) setLoadError(apiErrorMessage(err, "Failed to load."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, isEdit]);

  const amountValue = Number(amount);
  const needsFile = type === "DOCUMENT" && !isEdit && !hasDocument;
  const canSave =
    description.trim() !== "" &&
    expenseDate !== "" &&
    Number.isFinite(amountValue) &&
    amountValue > 0 &&
    (scope !== "PROJECT" || projectId !== "") &&
    (!needsFile || file !== null);

  function buildPayload(isDraft: boolean): CreateExpensePayload {
    return {
      scope,
      ...(scope === "PROJECT" ? { projectId } : {}),
      type,
      category,
      amount: amountValue,
      currency: "INR",
      description: description.trim(),
      expenseDate,
      isDraft,
    };
  }

  async function maybeUpload(expenseId: string): Promise<void> {
    if (type === "DOCUMENT" && file) {
      setUploadStatus("uploading");
      try {
        await uploadExpenseDocument(expenseId, file);
        setUploadStatus("done");
      } catch (err) {
        setUploadStatus("error");
        toast.error(apiErrorMessage(err, "Saved, but the file upload failed."));
      }
    }
  }

  async function handleSave(action: "draft" | "submit") {
    if (!canSave) {
      setError("Please complete all required fields.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let expenseId = id ?? "";
      if (isEdit && id) {
        const payload = buildPayload(false);
        delete (payload as { isDraft?: boolean }).isDraft;
        await updateExpense(id, payload);
      } else {
        const created = await createExpense(buildPayload(action === "draft"));
        expenseId = created.id;
      }
      await maybeUpload(expenseId);
      if (action === "submit") {
        if (isEdit) await submitExpense(expenseId);
        toast.success("Expense submitted.");
      } else {
        toast.success("Draft saved.");
      }
      navigate(`/employee/expenses/${expenseId}`);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to save expense."));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={isEdit ? "Edit Draft" : "Submit Expense"}
        breadcrumbs={[
          { label: "Expenses", to: "/employee/expenses" },
          { label: isEdit ? "Edit" : "Submit" },
        ]}
      />

      {loading ? (
        <LoadingState label="Loading…" />
      ) : loadError ? (
        <ErrorState
          title="Couldn't open the form"
          description={loadError}
          onRetry={() => navigate("/employee/expenses")}
          retryLabel="Back to expenses"
        />
      ) : (
        <form onSubmit={(e) => e.preventDefault()}>
          <Card>
            <CardContent className="grid grid-cols-1 gap-5 pt-6 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="scope">Expense scope</Label>
                <Select value={scope} onValueChange={(v) => setScope((v ?? "PROJECT") as ExpenseScope)}>
                  <SelectTrigger id="scope" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_SCOPES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {SCOPE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {scope === "PROJECT" ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="project">Project</Label>
                  <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "")}>
                    <SelectTrigger id="project" className="w-full">
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
              ) : (
                <div className="hidden sm:block" />
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="category">Category</Label>
                <Select value={category} onValueChange={(v) => setCategory((v ?? "TRAVEL") as ExpenseCategory)}>
                  <SelectTrigger id="category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="type">Type</Label>
                <Select value={type} onValueChange={(v) => setType((v ?? "CASH") as ExpenseType)}>
                  <SelectTrigger id="type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="amount">Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="date">Expense date</Label>
                <Input
                  id="date"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                />
              </div>

              {type === "DOCUMENT" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="file">
                    Receipt / Invoice
                    {hasDocument && (
                      <span className="font-normal text-muted-foreground">
                        {" "}(replace existing)
                      </span>
                    )}
                  </Label>
                  <Input
                    id="file"
                    type="file"
                    accept={ACCEPT}
                    onChange={(e) => {
                      setFile(e.target.files?.[0] ?? null);
                      setUploadStatus("idle");
                    }}
                  />
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Upload className="size-3" />
                    JPG, PNG, WEBP, or PDF (max 5 MB)
                  </p>
                  {file && (
                    <div className="rounded-md border bg-muted/40 p-2 text-xs">
                      <p className="truncate font-medium text-foreground">
                        {file.name}
                      </p>
                      <p className="text-muted-foreground">
                        {file.type || "unknown type"} ·{" "}
                        {(file.size / 1024).toFixed(0)} KB
                      </p>
                      {uploadStatus === "uploading" && (
                        <p className="mt-1 flex items-center gap-1 text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" />
                          Uploading…
                        </p>
                      )}
                      {uploadStatus === "done" && (
                        <p className="mt-1 text-emerald-600">Uploaded ✓</p>
                      )}
                      {uploadStatus === "error" && (
                        <p className="mt-1 text-destructive">Upload failed</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What was this expense for?"
                />
              </div>

              {error && (
                <p role="alert" className="text-sm text-destructive sm:col-span-2">
                  {error}
                </p>
              )}
            </CardContent>

            <CardFooter className="justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/employee/expenses")}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSave("draft")}
                disabled={!canSave || busy}
              >
                <Save className="size-4" />
                Save Draft
              </Button>
              <Button
                type="button"
                onClick={() => handleSave("submit")}
                disabled={!canSave || busy}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Submit
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}
    </>
  );
}
