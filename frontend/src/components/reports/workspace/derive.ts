/**
 * Pure derivation helpers that turn the raw expense lifecycle list
 * (`listReviewExpenses("ALL")`) joined with the user directory (`listUsers`)
 * into the department / employee / reimbursement / processing / audit metrics
 * the executive report sections render.
 *
 * Everything here is computed from real records — no fabricated numbers. Where a
 * metric genuinely has no source in the current data model (e.g. per-department
 * budgets, reimbursement payout timestamps) it is intentionally absent rather
 * than invented; callers surface that honestly.
 */

import type { Expense, ReimbursementStatus } from "../../../types/expense";
import { CATEGORY_LABELS } from "../../../types/expense";
import type { User } from "../../../types/user";

const APPROVED = "APPROVED";
const REJECTED = "REJECTED";
const PENDING_SET = new Set(["SUBMITTED", "PENDING_REVIEW"]);

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface MonthBucket {
  key: string; // YYYY-MM
  label: string; // e.g. "Jun"
}

/** Build the last `n` month buckets ending with the current month. */
export function lastMonths(n: number): MonthBucket[] {
  const out: MonthBucket[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: d.toLocaleString("en-US", { month: "short" }) });
  }
  return out;
}

function monthKey(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function buildUserMap(users: User[]): Map<string, User> {
  return new Map(users.map((u) => [u.id, u]));
}

const NO_DEPT = "Unassigned";

/* -------------------------- Overview KPIs ------------------------------ */

export interface KpiTotals {
  total: { count: number; amount: number };
  approved: { count: number; amount: number };
  pending: { count: number; amount: number };
  rejected: { count: number; amount: number };
}

/**
 * Compute the headline KPIs from a record list so they honor the active date
 * range (the backend overview report is all-time). DRAFTs are excluded from the
 * submitted total, matching the backend's definition.
 */
export function deriveKpis(records: Expense[]): KpiTotals {
  const mk = () => ({ count: 0, amount: 0 });
  const k: KpiTotals = { total: mk(), approved: mk(), pending: mk(), rejected: mk() };
  for (const e of records) {
    if (e.approvalStatus === "DRAFT") continue;
    k.total.count += 1;
    k.total.amount += e.amount;
    if (e.approvalStatus === APPROVED) {
      k.approved.count += 1;
      k.approved.amount += e.amount;
    } else if (PENDING_SET.has(e.approvalStatus)) {
      k.pending.count += 1;
      k.pending.amount += e.amount;
    } else if (e.approvalStatus === REJECTED) {
      k.rejected.count += 1;
      k.rejected.amount += e.amount;
    }
  }
  return k;
}

/** Approved spend per month over the last `n` months, derived from records. */
export function deriveMonthlyApproved(
  records: Expense[],
  n = 12,
): { key: string; label: string; amount: number }[] {
  const months = lastMonths(n);
  const idx = new Map(months.map((m, i) => [m.key, i]));
  const out = months.map((m) => ({ key: m.key, label: m.label, amount: 0 }));
  for (const e of records) {
    if (e.approvalStatus !== APPROVED) continue;
    const i = idx.get(monthKey(e.expenseDate));
    if (i !== undefined) out[i]!.amount += e.amount;
  }
  return out;
}

/* ----------------------------- Departments ----------------------------- */

export interface DepartmentMetric {
  name: string;
  headcount: number;
  activeHeadcount: number;
  totalSpend: number; // approved
  expenseCount: number;
  pendingCount: number;
  pendingAmount: number;
  reimbursementPending: number; // approved & not yet PAID
  avgProcessingDays: number | null;
  manualCount: number;
  /** Distinct projects this department has booked expenses against. */
  projectsEngaged: number;
  spark: number[]; // approved spend over last 6 months
  /** 0–1 risk score from pending ratio + manual ratio. */
  risk: number;
  shareOfSpend: number; // 0–1 of org approved spend
}

export function deriveDepartments(
  expenses: Expense[],
  users: User[],
): DepartmentMetric[] {
  const userMap = buildUserMap(users);
  const months = lastMonths(6);
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));

  // Seed every department that has members so empty depts still appear.
  const seed = new Map<string, DepartmentMetric>();
  const ensure = (name: string): DepartmentMetric => {
    let d = seed.get(name);
    if (!d) {
      d = {
        name,
        headcount: 0,
        activeHeadcount: 0,
        totalSpend: 0,
        expenseCount: 0,
        pendingCount: 0,
        pendingAmount: 0,
        reimbursementPending: 0,
        avgProcessingDays: null,
        manualCount: 0,
        projectsEngaged: 0,
        spark: months.map(() => 0),
        risk: 0,
        shareOfSpend: 0,
      };
      seed.set(name, d);
    }
    return d;
  };

  for (const u of users) {
    const d = ensure(u.department?.trim() || NO_DEPT);
    d.headcount += 1;
    if (u.isActive) d.activeHeadcount += 1;
  }

  const procAccum = new Map<string, { sum: number; n: number }>();
  const deptProjects = new Map<string, Set<string>>();
  let orgApproved = 0;

  for (const e of expenses) {
    const dept = userMap.get(e.employeeId)?.department?.trim() || NO_DEPT;
    const d = ensure(dept);
    d.expenseCount += 1;
    if (e.creationMethod === "MANUAL") d.manualCount += 1;
    if (e.scope === "PROJECT" && e.projectId) {
      const set = deptProjects.get(dept) ?? new Set<string>();
      set.add(e.projectId);
      deptProjects.set(dept, set);
    }

    if (e.approvalStatus === APPROVED) {
      d.totalSpend += e.amount;
      orgApproved += e.amount;
      const mi = monthIndex.get(monthKey(e.expenseDate));
      if (mi !== undefined) d.spark[mi]! += e.amount;
      if (e.reimbursementStatus !== "PAID") d.reimbursementPending += e.amount;
    } else if (PENDING_SET.has(e.approvalStatus)) {
      d.pendingCount += 1;
      d.pendingAmount += e.amount;
    }

    if (e.reviewedAt) {
      const ms = Date.parse(e.reviewedAt) - Date.parse(e.createdAt);
      if (!Number.isNaN(ms) && ms >= 0) {
        const acc = procAccum.get(dept) ?? { sum: 0, n: 0 };
        acc.sum += ms;
        acc.n += 1;
        procAccum.set(dept, acc);
      }
    }
  }

  for (const [name, acc] of procAccum) {
    const d = seed.get(name);
    if (d && acc.n > 0) d.avgProcessingDays = acc.sum / acc.n / MS_PER_DAY;
  }

  const list = [...seed.values()];
  for (const d of list) {
    d.projectsEngaged = deptProjects.get(d.name)?.size ?? 0;
    d.shareOfSpend = orgApproved > 0 ? d.totalSpend / orgApproved : 0;
    const pendingRatio = d.expenseCount > 0 ? d.pendingCount / d.expenseCount : 0;
    const manualRatio = d.expenseCount > 0 ? d.manualCount / d.expenseCount : 0;
    d.risk = Math.min(1, pendingRatio * 0.7 + manualRatio * 0.3);
  }
  return list.sort((a, b) => b.totalSpend - a.totalSpend);
}

/* ------------------------- Department detail --------------------------- */

export interface DepartmentDetail {
  name: string;
  exists: boolean;
  headcount: number;
  activeHeadcount: number;
  totalSpend: number;
  pendingAmount: number;
  reimbursementOutstanding: number;
  reimbursementPaid: number;
  avgProcessingDays: number | null;
  projectsEngaged: number;
  approvalRate: number | null; // %
  documentationRate: number | null; // %
  manualRate: number | null; // %
  healthScore: number | null; // 0–100
  monthly: { label: string; value: number }[];
  categories: { category: string; amount: number }[];
  projects: { name: string; amount: number }[];
  employees: {
    id: string;
    name: string;
    role: string;
    totalSpend: number;
    approvedCount: number;
    submittedCount: number;
  }[];
  reimbursement: Record<ReimbursementStatus, { count: number; amount: number }>;
}

/**
 * Build the full analytics model for a single department from the raw records.
 * `projectNames` maps projectId → display name (from the projects report).
 */
export function deriveDepartmentDetail(
  name: string,
  expenses: Expense[],
  users: User[],
  projectNames: Map<string, string>,
): DepartmentDetail {
  const members = users.filter((u) => (u.department?.trim() || NO_DEPT) === name);
  const memberIds = new Set(members.map((u) => u.id));
  const userMap = buildUserMap(users);
  const months = lastMonths(12);
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));

  const monthly = months.map((m) => ({ label: m.label, value: 0 }));
  const categoryMap = new Map<string, number>();
  const projectMap = new Map<string, number>();
  const empMap = new Map<string, DepartmentDetail["employees"][number]>();
  const reimbursement: DepartmentDetail["reimbursement"] = {
    PENDING: { count: 0, amount: 0 },
    PROCESSING: { count: 0, amount: 0 },
    PAID: { count: 0, amount: 0 },
  };

  let totalSpend = 0;
  let pendingAmount = 0;
  let approved = 0;
  let rejected = 0;
  let withDoc = 0;
  let manual = 0;
  let counted = 0;
  let procSum = 0;
  let procN = 0;

  for (const e of expenses) {
    if (!memberIds.has(e.employeeId)) continue;
    counted += 1;
    if (e.creationMethod === "MANUAL") manual += 1;
    if ((e.documentIds?.length ?? 0) > 0 || e.documentId) withDoc += 1;
    if (e.reviewedAt) {
      const ms = Date.parse(e.reviewedAt) - Date.parse(e.createdAt);
      if (!Number.isNaN(ms) && ms >= 0) {
        procSum += ms;
        procN += 1;
      }
    }
    if (e.approvalStatus === APPROVED) {
      approved += 1;
      totalSpend += e.amount;
      const mi = monthIndex.get(monthKey(e.expenseDate));
      if (mi !== undefined) monthly[mi]!.value += e.amount;
      categoryMap.set(e.category, (categoryMap.get(e.category) ?? 0) + e.amount);
      if (e.scope === "PROJECT" && e.projectId) {
        const label = projectNames.get(e.projectId) ?? "Unnamed project";
        projectMap.set(label, (projectMap.get(label) ?? 0) + e.amount);
      }
      const slot = reimbursement[e.reimbursementStatus];
      slot.count += 1;
      slot.amount += e.amount;
    } else if (PENDING_SET.has(e.approvalStatus)) {
      pendingAmount += e.amount;
    } else if (e.approvalStatus === REJECTED) {
      rejected += 1;
    }

    const u = userMap.get(e.employeeId);
    const emp =
      empMap.get(e.employeeId) ??
      {
        id: e.employeeId,
        name: u?.name ?? "Unknown",
        role: u?.role ?? "—",
        totalSpend: 0,
        approvedCount: 0,
        submittedCount: 0,
      };
    emp.submittedCount += 1;
    if (e.approvalStatus === APPROVED) {
      emp.approvedCount += 1;
      emp.totalSpend += e.amount;
    }
    empMap.set(e.employeeId, emp);
  }

  const decided = approved + rejected;
  const approvalRate = decided > 0 ? (approved / decided) * 100 : null;
  const documentationRate = counted > 0 ? (withDoc / counted) * 100 : null;
  const manualRate = counted > 0 ? (manual / counted) * 100 : null;
  const avgProcessingDays = procN > 0 ? procSum / procN / MS_PER_DAY : null;

  // Composite health score from the available signals (re-weighted when a
  // signal has no data, so departments aren't penalized for missing inputs).
  const comps: { v: number; w: number }[] = [];
  if (approvalRate !== null) comps.push({ v: approvalRate / 100, w: 0.4 });
  if (documentationRate !== null) comps.push({ v: documentationRate / 100, w: 0.3 });
  if (avgProcessingDays !== null)
    comps.push({ v: Math.max(0, 1 - avgProcessingDays / 10), w: 0.3 });
  const weight = comps.reduce((s, c) => s + c.w, 0);
  const healthScore =
    weight > 0 ? Math.round((comps.reduce((s, c) => s + c.v * c.w, 0) / weight) * 100) : null;

  const employees = [...empMap.values()].sort((a, b) => b.totalSpend - a.totalSpend);

  return {
    name,
    exists: members.length > 0 || counted > 0,
    headcount: members.length,
    activeHeadcount: members.filter((u) => u.isActive).length,
    totalSpend,
    pendingAmount,
    reimbursementOutstanding: reimbursement.PENDING.amount + reimbursement.PROCESSING.amount,
    reimbursementPaid: reimbursement.PAID.amount,
    avgProcessingDays,
    projectsEngaged: projectMap.size,
    approvalRate,
    documentationRate,
    manualRate,
    healthScore,
    monthly,
    categories: [...categoryMap.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    projects: [...projectMap.entries()]
      .map(([name2, amount]) => ({ name: name2, amount }))
      .sort((a, b) => b.amount - a.amount),
    employees,
    reimbursement,
  };
}

/* ------------------------------ Employees ------------------------------ */

export interface EmployeeMetric {
  id: string;
  name: string;
  department: string;
  role: string;
  totalSpend: number; // approved
  submittedCount: number;
  approvedCount: number;
  rejectedCount: number;
  manualCount: number;
  avgAmount: number;
}

export function deriveEmployees(
  expenses: Expense[],
  users: User[],
): EmployeeMetric[] {
  const userMap = buildUserMap(users);
  const acc = new Map<string, EmployeeMetric>();
  const ensure = (id: string): EmployeeMetric => {
    let m = acc.get(id);
    if (!m) {
      const u = userMap.get(id);
      m = {
        id,
        name: u?.name ?? "Unknown user",
        department: u?.department?.trim() || NO_DEPT,
        role: u?.role ?? "—",
        totalSpend: 0,
        submittedCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        manualCount: 0,
        avgAmount: 0,
      };
      acc.set(id, m);
    }
    return m;
  };

  for (const e of expenses) {
    const m = ensure(e.employeeId);
    m.submittedCount += 1;
    if (e.creationMethod === "MANUAL") m.manualCount += 1;
    if (e.approvalStatus === APPROVED) {
      m.approvedCount += 1;
      m.totalSpend += e.amount;
    } else if (e.approvalStatus === REJECTED) {
      m.rejectedCount += 1;
    }
  }
  const list = [...acc.values()];
  for (const m of list) {
    m.avgAmount = m.approvedCount > 0 ? m.totalSpend / m.approvedCount : 0;
  }
  return list.sort((a, b) => b.totalSpend - a.totalSpend);
}

/* ---------------------------- Reimbursements --------------------------- */

export interface ReimbursementModel {
  byStatus: Record<ReimbursementStatus, { count: number; amount: number }>;
  pendingAmount: number; // PENDING + PROCESSING
  paidAmount: number;
  outstandingCount: number;
  byDepartment: { name: string; outstanding: number; paid: number }[];
}

export function deriveReimbursements(
  expenses: Expense[],
  users: User[],
): ReimbursementModel {
  const userMap = buildUserMap(users);
  const byStatus: ReimbursementModel["byStatus"] = {
    PENDING: { count: 0, amount: 0 },
    PROCESSING: { count: 0, amount: 0 },
    PAID: { count: 0, amount: 0 },
  };
  const deptMap = new Map<string, { outstanding: number; paid: number }>();

  for (const e of expenses) {
    if (e.approvalStatus !== APPROVED) continue; // only approved reimburse
    const slot = byStatus[e.reimbursementStatus];
    slot.count += 1;
    slot.amount += e.amount;
    const dept = userMap.get(e.employeeId)?.department?.trim() || NO_DEPT;
    const d = deptMap.get(dept) ?? { outstanding: 0, paid: 0 };
    if (e.reimbursementStatus === "PAID") d.paid += e.amount;
    else d.outstanding += e.amount;
    deptMap.set(dept, d);
  }

  const pendingAmount = byStatus.PENDING.amount + byStatus.PROCESSING.amount;
  return {
    byStatus,
    pendingAmount,
    paidAmount: byStatus.PAID.amount,
    outstandingCount: byStatus.PENDING.count + byStatus.PROCESSING.count,
    byDepartment: [...deptMap.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.outstanding - a.outstanding),
  };
}

/* ----------------------------- Processing ------------------------------ */

export interface ProcessingModel {
  avgDays: number | null;
  medianDays: number | null;
  reviewedCount: number;
  /** Buckets of turnaround time. */
  buckets: { label: string; count: number }[];
}

export function deriveProcessing(expenses: Expense[]): ProcessingModel {
  const days: number[] = [];
  for (const e of expenses) {
    if (!e.reviewedAt) continue;
    const ms = Date.parse(e.reviewedAt) - Date.parse(e.createdAt);
    if (!Number.isNaN(ms) && ms >= 0) days.push(ms / MS_PER_DAY);
  }
  if (days.length === 0) {
    return { avgDays: null, medianDays: null, reviewedCount: 0, buckets: [] };
  }
  days.sort((a, b) => a - b);
  const avg = days.reduce((s, d) => s + d, 0) / days.length;
  const median = days[Math.floor(days.length / 2)]!;
  const buckets = [
    { label: "< 1 day", count: days.filter((d) => d < 1).length },
    { label: "1–3 days", count: days.filter((d) => d >= 1 && d < 3).length },
    { label: "3–7 days", count: days.filter((d) => d >= 3 && d < 7).length },
    { label: "7 days +", count: days.filter((d) => d >= 7).length },
  ];
  return { avgDays: avg, medianDays: median, reviewedCount: days.length, buckets };
}

/* ------------------------------- Audit --------------------------------- */

export interface AuditFlag {
  id: string;
  employee: string;
  department: string;
  reason: string;
  amount: number;
  date: string;
  severity: "high" | "medium";
}

export interface AuditModel {
  manualCount: number;
  manualPct: number | null;
  missingDocCount: number; // CASH / no document attached
  rejectedCount: number;
  highValueThreshold: number;
  flags: AuditFlag[];
}

export function deriveAudit(expenses: Expense[], users: User[]): AuditModel {
  const userMap = buildUserMap(users);
  const total = expenses.length;
  let manualCount = 0;
  let missingDocCount = 0;
  let rejectedCount = 0;

  // High-value threshold = 95th percentile of approved amounts (data-relative).
  const approvedAmounts = expenses
    .filter((e) => e.approvalStatus === APPROVED)
    .map((e) => e.amount)
    .sort((a, b) => a - b);
  const highValueThreshold =
    approvedAmounts.length > 0
      ? approvedAmounts[Math.floor(approvedAmounts.length * 0.95)] ??
        approvedAmounts[approvedAmounts.length - 1]!
      : 0;

  const flags: AuditFlag[] = [];
  for (const e of expenses) {
    const hasDoc = (e.documentIds?.length ?? 0) > 0 || Boolean(e.documentId);
    const manual = e.creationMethod === "MANUAL";
    if (manual) manualCount += 1;
    if (!hasDoc) missingDocCount += 1;
    if (e.approvalStatus === REJECTED) rejectedCount += 1;

    const u = userMap.get(e.employeeId);
    const base = {
      id: e.id,
      employee: u?.name ?? "Unknown",
      department: u?.department?.trim() || NO_DEPT,
      amount: e.amount,
      date: e.expenseDate,
    };
    if (
      e.approvalStatus === APPROVED &&
      highValueThreshold > 0 &&
      e.amount >= highValueThreshold &&
      !hasDoc
    ) {
      flags.push({ ...base, reason: "High-value approval without a document", severity: "high" });
    } else if (manual && !hasDoc && PENDING_SET.has(e.approvalStatus)) {
      flags.push({ ...base, reason: "Manual entry, no document, awaiting review", severity: "medium" });
    }
  }
  flags.sort((a, b) => (a.severity === b.severity ? b.amount - a.amount : a.severity === "high" ? -1 : 1));

  return {
    manualCount,
    manualPct: total > 0 ? (manualCount / total) * 100 : null,
    missingDocCount,
    rejectedCount,
    highValueThreshold,
    flags: flags.slice(0, 25),
  };
}

/* ------------------------- Category by department ---------------------- */

/** Build a department × category spend matrix (approved) for the heatmap. */
export function deriveCategoryHeatmap(
  expenses: Expense[],
  users: User[],
  topDepartments: string[],
): { xLabels: string[]; yLabels: string[]; matrix: number[][] } {
  const userMap = buildUserMap(users);
  const cats = Object.keys(CATEGORY_LABELS);
  const deptIdx = new Map(topDepartments.map((d, i) => [d, i]));
  const catIdx = new Map(cats.map((c, i) => [c, i]));
  const matrix = topDepartments.map(() => cats.map(() => 0));

  for (const e of expenses) {
    if (e.approvalStatus !== APPROVED) continue;
    const dept = userMap.get(e.employeeId)?.department?.trim() || NO_DEPT;
    const di = deptIdx.get(dept);
    const ci = catIdx.get(e.category);
    if (di === undefined || ci === undefined) continue;
    matrix[di]![ci]! += e.amount;
  }
  return {
    xLabels: cats.map((c) => CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS]),
    yLabels: topDepartments,
    matrix,
  };
}
