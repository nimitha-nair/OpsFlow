import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Save, Send, Sparkles, Upload } from "lucide-react";
import { useAuth } from "../../context/auth-context";
import { expensesBasePath, myExpensesPath } from "../../lib/permissions";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
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
import { ReceiptDropzone } from "../../components/expenses/ReceiptDropzone";
import { ScopeSelector } from "../../components/expenses/ScopeSelector";
import { ManualEntryCard } from "../../components/expenses/ManualEntryCard";
import { listMyProjects } from "../../lib/projects-api";
import {
  apiErrorMessage,
  createExpense,
  getExpense,
  updateExpense,
  uploadExpenseDocuments,
} from "../../lib/expenses-api";
import {
  CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  type CreateExpensePayload,
  type ExpenseCategory,
  type ExpenseScope,
} from "../../types/expense";
import type { Project } from "../../types/project";

const FILE_INPUT_ID = "receipt-upload-input";

/** Required-field asterisk. */
function Req() {
  return <span className="text-destructive"> *</span>;
}

export function SubmitExpensePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const { user } = useAuth();
  const base = user ? expensesBasePath(user.role) : "/employee/expenses";
  const myBase = user ? myExpensesPath(user.role) : "/employee/expenses";

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [scope, setScope] = useState<ExpenseScope>("GENERAL");
  const [projectId, setProjectId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  // The manual fallback (and edit mode) reveals amount/date/category/description.
  const [manualMode, setManualMode] = useState(false);
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("TRAVEL");
  const [description, setDescription] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          // Editing always exposes the metadata fields.
          setManualMode(true);
          setScope(expense.scope);
          setProjectId(expense.projectId ?? "");
          setCategory(expense.category);
          setAmount(expense.amount ? String(expense.amount) : "");
          setExpenseDate(expense.expenseDate);
          setDescription(expense.description);
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

  // Manual / edit paths require a project up-front for PROJECT scope. The AI path
  // allows deferring project allocation to the verify step.
  const projectChosen = scope === "GENERAL" || projectId !== "";
  const amountValue = Number(amount);
  const manualReady =
    projectChosen &&
    description.trim() !== "" &&
    expenseDate !== "" &&
    Number.isFinite(amountValue) &&
    amountValue > 0;
  // AI analysis is available for BOTH scopes once a receipt is staged; the project
  // (for PROJECT scope) is allocated later in the verify step.
  const aiReady = files.length > 0;

  function withProject(payload: CreateExpensePayload): CreateExpensePayload {
    return scope === "PROJECT" && projectId
      ? { ...payload, projectId }
      : payload;
  }

  /** AI path: create a draft, upload the receipts, then go to analysis. */
  async function handleAnalyze() {
    setBusy(true);
    setError(null);
    try {
      const created = await createExpense(
        withProject({ scope, type: "DOCUMENT", currency: "INR", isDraft: true }),
      );
      await uploadExpenseDocuments(created.id, files);
      toast.success("Draft saved — starting analysis…");
      navigate(`${base}/${created.id}/analysis?analyze=1`);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to start analysis."));
      setBusy(false);
    }
  }

  /** AI path: save as a draft (uploading any staged receipts) without analyzing. */
  async function handleSaveAiDraft() {
    setBusy(true);
    setError(null);
    try {
      const created = await createExpense(
        withProject({ scope, type: "DOCUMENT", currency: "INR", isDraft: true }),
      );
      if (files.length > 0) await uploadExpenseDocuments(created.id, files);
      toast.success("Draft saved.");
      navigate(`${base}/${created.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to save draft."));
      setBusy(false);
    }
  }

  /** Manual fallback: create a CASH expense (draft or submitted). */
  async function handleManualSave(action: "draft" | "submit") {
    if (!manualReady) {
      setError("Please complete all required fields.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createExpense(
        withProject({
          scope,
          type: "CASH",
          category,
          amount: amountValue,
          currency: "INR",
          description: description.trim(),
          expenseDate,
          isDraft: action !== "submit",
        }),
      );
      toast.success(action === "submit" ? "Expense submitted." : "Draft saved.");
      navigate(`${base}/${created.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to save expense."));
      setBusy(false);
    }
  }

  /** Edit mode: persist metadata changes to the existing draft. */
  async function handleEditSave() {
    if (!id) return;
    if (!manualReady) {
      setError("Please complete all required fields.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateExpense(id, {
        scope,
        ...(scope === "PROJECT" ? { projectId } : {}),
        category,
        amount: amountValue,
        currency: "INR",
        description: description.trim(),
        expenseDate,
      });
      toast.success("Changes saved.");
      navigate(`${base}/${id}`);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to save changes."));
      setBusy(false);
    }
  }

  // Project allocation field — required in the manual/edit paths; optional (and
  // deferrable) in the AI path.
  const projectRequired = manualMode || isEdit;
  const projectField = scope === "PROJECT" && (
    <div className="flex flex-col gap-2">
      <Label htmlFor="project">
        Select Project
        {projectRequired && <Req />}
      </Label>
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
      <p className="text-xs text-muted-foreground">
        {projectRequired
          ? "Choose where this expense is allocated."
          : "Optional now — you can allocate the project after reviewing the receipt."}
      </p>
    </div>
  );

  // Manual metadata fields, shared between the manual card (create) and edit mode.
  const manualFields = (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="category">
          Category
          <Req />
        </Label>
        <Select
          value={category}
          onValueChange={(v) => setCategory((v ?? "TRAVEL") as ExpenseCategory)}
        >
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
        <Label htmlFor="amount">
          Amount (₹)
          <Req />
        </Label>
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
        <Label htmlFor="date">
          Expense date
          <Req />
        </Label>
        <Input
          id="date"
          type="date"
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="description">
          Description
          <Req />
        </Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What was this expense for?"
        />
      </div>
    </div>
  );

  return (
    <div className="expense-scope">
      <PageHeader
        title={isEdit ? "Edit Draft" : "Submit Expense"}
        breadcrumbs={[
          { label: "Expenses", to: base },
          { label: isEdit ? "Edit" : "Submit" },
        ]}
      />

      {loading ? (
        <LoadingState label="Loading…" />
      ) : loadError ? (
        <ErrorState
          title="Couldn't open the form"
          description={loadError}
          onRetry={() => navigate(myBase)}
          retryLabel="Back to my expenses"
        />
      ) : (
        <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4">
          {/* Step 1 — Where does this belong? (scope cards + project allocation) */}
          <Card>
            <CardContent className="flex flex-col gap-5 pt-6">
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold">
                  Where does this belong?
                  <Req />
                </h2>
                <ScopeSelector value={scope} onChange={setScope} disabled={busy} />
              </div>
              {scope === "PROJECT" && (
                <div className="sm:max-w-sm">{projectField}</div>
              )}
            </CardContent>
          </Card>

          {/* Step 2 — Receipt (hero). Hidden in edit + manual modes. */}
          {!isEdit && !manualMode && (
            <Card>
              <CardContent className="flex flex-col gap-3 pt-6">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-ai" />
                  <h2 className="text-sm font-semibold">
                    Upload your receipt
                    <Req />
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  We&apos;ll read the vendor, amount, date, and category for you — no
                  manual typing. Add multiple files for multi-page invoices or
                  supporting documents.
                </p>
                <ReceiptDropzone
                  files={files}
                  onChange={setFiles}
                  inputId={FILE_INPUT_ID}
                  disabled={busy}
                />
              </CardContent>
            </Card>
          )}

          {/* Step 3 — Manual entry. Secondary card on create; inline in edit. */}
          {isEdit ? (
            <Card>
              <CardContent className="pt-6">{manualFields}</CardContent>
            </Card>
          ) : (
            <ManualEntryCard
              open={manualMode}
              onOpen={() => setManualMode(true)}
            >
              {manualFields}
            </ManualEntryCard>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          {/* Actions */}
          <Card>
            <CardFooter className="flex-wrap justify-end gap-2 pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(myBase)}
                disabled={busy}
              >
                Cancel
              </Button>

              {isEdit ? (
                <Button
                  type="button"
                  className="btn-primary"
                  onClick={handleEditSave}
                  disabled={!manualReady || busy}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Save Changes
                </Button>
              ) : manualMode ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleManualSave("draft")}
                    disabled={!manualReady || busy}
                  >
                    <Save className="size-4" />
                    Save Draft
                  </Button>
                  <Button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleManualSave("submit")}
                    disabled={!manualReady || busy}
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Submit
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSaveAiDraft}
                    disabled={busy}
                  >
                    <Save className="size-4" />
                    Save Draft
                  </Button>
                  {files.length === 0 ? (
                    <label
                      htmlFor={FILE_INPUT_ID}
                      className={`${buttonVariants()} btn-primary cursor-pointer`}
                    >
                      <Upload className="size-4" />
                      Upload Receipt
                    </label>
                  ) : (
                    <Button
                      type="button"
                      className="btn-primary"
                      onClick={handleAnalyze}
                      disabled={!aiReady || busy}
                      title="Save the draft and run AI analysis on your receipts"
                    >
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                      Analyze Receipt
                    </Button>
                  )}
                </>
              )}
            </CardFooter>
          </Card>
        </form>
      )}
    </div>
  );
}
