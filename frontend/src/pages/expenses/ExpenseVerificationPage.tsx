import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { LoadingState } from "../../components/common/LoadingState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { ConfidenceMeter } from "../../components/expenses/ConfidenceMeter";
import { LowConfidenceBanner } from "../../components/expenses/LowConfidenceBanner";
import { MockAnalysisBadge } from "../../components/expenses/MockAnalysisBadge";
import { ReceiptPreview } from "../../components/expenses/ReceiptPreview";
import { getExpenseAnalysis, updateExpenseAnalysis } from "../../lib/expense-analysis-api";
import { submitExpense } from "../../lib/expenses-api";
import {
  deriveLowConfidenceReason,
  mapToExpenseCategory,
  type ExpenseAnalysis,
} from "../../types/expenseAnalysis";
import { CATEGORY_LABELS, type ExpenseCategory } from "../../types/expense";

interface Form {
  vendorName: string;
  amount: string;
  transactionDate: string;
  currency: string;
  paymentMethod: string;
  category: ExpenseCategory | "";
  taxInformation: string;
}

/** Keep unsaved verify edits across Back-to-analysis round-trips. */
const draftKey = (id: string) => `expense-verify-draft:${id}`;

export function ExpenseVerificationPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form | null>(null);
  const [analysis, setAnalysis] = useState<ExpenseAnalysis | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await getExpenseAnalysis(id);
        if (cancelled) return;
        setAnalysis(a);
        // Restore in-progress edits (e.g. after "Back to analysis"); otherwise
        // hydrate from the analysis.
        let restored: Form | null = null;
        try {
          const saved = sessionStorage.getItem(draftKey(id));
          if (saved) restored = JSON.parse(saved) as Form;
        } catch {
          restored = null;
        }
        setForm(
          restored ?? {
            vendorName: a?.vendorName ?? "",
            amount: a?.amount != null ? String(a.amount) : "",
            transactionDate: a?.transactionDate ?? "",
            currency: a?.currency ?? "INR",
            paymentMethod: a?.paymentMethod ?? "",
            category: mapToExpenseCategory(a?.category) ?? "",
            taxInformation: a?.taxInformation ?? "",
          },
        );
      } catch {
        if (!cancelled) toast.error("Could not load analysis data.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!form) return <LoadingState label="Loading analysis…" />;

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, [k]: v };
      try {
        sessionStorage.setItem(draftKey(id), JSON.stringify(next));
      } catch {
        /* storage unavailable — edits simply won't persist across navigation */
      }
      return next;
    });

  const confirmAndSubmit = async () => {
    setSaving(true);
    try {
      await updateExpenseAnalysis(id, {
        vendorName: form.vendorName || undefined,
        amount: form.amount ? Number(form.amount) : undefined,
        transactionDate: form.transactionDate || undefined,
        currency: form.currency || undefined,
        paymentMethod: form.paymentMethod || undefined,
        category: form.category || undefined,
        taxInformation: form.taxInformation || undefined,
        confirm: true,
      });
      await submitExpense(id);
      sessionStorage.removeItem(draftKey(id));
      toast.success("Expense submitted for approval.");
      navigate(`/employee/expenses/${id}`);
    } catch {
      toast.error("Could not submit. Check the values and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receipt</CardTitle>
        </CardHeader>
        <CardContent>
          <ReceiptPreview expenseId={id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Verify extracted values</CardTitle>
          {analysis?.provider === "mock" && <MockAnalysisBadge />}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {analysis?.status === "LOW_CONFIDENCE" && (
            <LowConfidenceBanner reason={deriveLowConfidenceReason(analysis)} />
          )}
          {typeof analysis?.confidenceScore === "number" && (
            <ConfidenceMeter score={analysis.confidenceScore} />
          )}
          <Labeled label="Vendor">
            <Input value={form.vendorName} onChange={(e) => set("vendorName", e.target.value)} />
          </Labeled>
          <Labeled label="Amount">
            <Input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
          </Labeled>
          <Labeled label="Date">
            <Input type="date" value={form.transactionDate} onChange={(e) => set("transactionDate", e.target.value)} />
          </Labeled>
          <Labeled label="Currency">
            <Input value={form.currency} onChange={(e) => set("currency", e.target.value)} />
          </Labeled>
          <Labeled label="Payment method">
            <Input value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} />
          </Labeled>
          <Labeled label="Category">
            <Select
              value={form.category}
              onValueChange={(v) => set("category", (v ?? "") as ExpenseCategory | "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Labeled>
          <Labeled label="Tax info">
            <Input value={form.taxInformation} onChange={(e) => set("taxInformation", e.target.value)} />
          </Labeled>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={confirmAndSubmit} disabled={saving}>
              Confirm &amp; submit for approval
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(`/employee/expenses/${id}/analysis`)}
              title="Your edits are kept"
            >
              <ArrowLeft className="size-4" />
              Back to analysis
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate(`/employee/expenses/${id}`)}
            >
              <FileText className="size-4" />
              Back to expense
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Your edits are kept if you go back to review the receipt.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
