import { db } from "../config/firebase";
import UserRole from "../types/roles";

export type SearchEntity = "task" | "project" | "user" | "expense" | "ticket";

export interface SearchResult {
  entity: SearchEntity;
  id: string;
  code?: string;
  title: string;
  subtitle?: string;
}

interface Actor {
  userId: string;
  role: UserRole;
}

/** Build a result, omitting optional fields that are undefined. */
function result(
  entity: SearchEntity,
  id: string,
  title: string,
  code?: string,
  subtitle?: string,
): SearchResult {
  const r: SearchResult = { entity, id, title };
  if (code !== undefined) r.code = code;
  if (subtitle !== undefined) r.subtitle = subtitle;
  return r;
}

type Doc = Record<string, unknown> & { id: string };

async function loadDocs(collection: string): Promise<Doc[]> {
  const snap = await db.collection(collection).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const CAP = 6;

/**
 * Cross-entity search across tasks, projects, people, expenses and tickets.
 * RBAC-scoped: Admin sees everything; HR sees projects/people/expenses and
 * HR-team tickets; employees see only their own tasks, expenses and tickets.
 * Matches on name/title/subject, human-readable code, and key text fields.
 */
export async function globalSearch(
  rawQuery: string,
  actor: Actor,
): Promise<SearchResult[]> {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  const has = (...vals: unknown[]) =>
    vals.some((v) => typeof v === "string" && v.toLowerCase().includes(q));

  const isAdmin = actor.role === UserRole.ADMIN;
  const isHr = actor.role === UserRole.HR;
  const isStaff = isAdmin || isHr;
  const out: SearchResult[] = [];

  // --- Tickets ---
  {
    let docs = await loadDocs("tickets");
    if (isHr) docs = docs.filter((t) => (str(t.team) ?? "SYSTEM") === "HR");
    else if (!isStaff) docs = docs.filter((t) => t.createdBy === actor.userId);
    out.push(
      ...docs
        .filter((t) => has(t.subject, t.code, t.description))
        .slice(0, CAP)
        .map((t) =>
          result("ticket", t.id, str(t.subject) ?? "Ticket", str(t.code), str(t.status)),
        ),
    );
  }

  // --- Tasks ---
  {
    let docs = await loadDocs("tasks");
    if (!isStaff)
      docs = docs.filter(
        (t) =>
          (t.assignment as { userIds?: string[] } | undefined)?.userIds?.includes(
            actor.userId,
          ) || t.createdBy === actor.userId,
      );
    out.push(
      ...docs
        .filter((t) => has(t.title, t.code, t.description))
        .slice(0, CAP)
        .map((t) =>
          result("task", t.id, str(t.title) ?? "Task", str(t.code), str(t.status)),
        ),
    );
  }

  // --- Expenses ---
  {
    let docs = await loadDocs("expenses");
    if (!isStaff) docs = docs.filter((e) => e.employeeId === actor.userId);
    out.push(
      ...docs
        .filter((e) => has(e.code, e.description, e.category))
        .slice(0, CAP)
        .map((e) =>
          result(
            "expense",
            e.id,
            str(e.description) || str(e.category) || "Expense",
            str(e.code),
            str(e.approvalStatus),
          ),
        ),
    );
  }

  // --- Projects & people (staff only) ---
  if (isStaff) {
    const projects = await loadDocs("projects");
    out.push(
      ...projects
        .filter((p) => has(p.name, p.code, p.clientName))
        .slice(0, CAP)
        .map((p) =>
          result("project", p.id, str(p.name) ?? "Project", str(p.code), str(p.status)),
        ),
    );

    const users = await loadDocs("users");
    out.push(
      ...users
        .filter((u) => has(u.name, u.email, u.department, u.position))
        .slice(0, CAP)
        .map((u) =>
          result("user", u.id, str(u.name) ?? "User", undefined, str(u.email)),
        ),
    );
  }

  return out;
}
