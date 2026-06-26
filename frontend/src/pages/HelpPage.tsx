import { useState } from "react";
import type { FormEvent } from "react";
import {
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  ClipboardCheck,
  ClipboardList,
  HandCoins,
  LifeBuoy,
  Loader2,
  Send,
  Sparkles,
  SquareKanban,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "../components/layout/PageHeader";
import { useAuth } from "../context/auth-context";
import { askManual, type HelpAnswer } from "../lib/help-api";
import { apiErrorMessage } from "../lib/users-api";
import type { Role } from "../types/auth";

interface HelpSection {
  title: string;
  icon: LucideIcon;
  /** Short how-to steps / tips. */
  points: string[];
}

/** Navigation tips everyone shares, regardless of role. */
const COMMON: HelpSection[] = [
  {
    title: "Getting around",
    icon: Zap,
    points: [
      "Use the left sidebar to switch between modules. On mobile, the bottom bar holds your most-used pages and “More” opens the full menu.",
      "Press ⌘K (or Ctrl+K) anywhere to open search — find a task, project, person, or expense by name or code (e.g. TSK-12, EXP-0041), or type a page name like “Reports” to jump straight there.",
      "The “Quick” button in the top bar gives one-click shortcuts for the things your role does most.",
      "The date filter on list and board pages is remembered as you move around; the badge next to it shows the active range.",
    ],
  },
  {
    title: "Notifications",
    icon: Bell,
    points: [
      "The bell icon next to your profile shows unread alerts — task assignments, status changes, comments and mentions, and ticket updates.",
      "Open the bell for a quick list, or visit the Notifications page (from the bell’s footer) to filter by type, unread-only, or date.",
      "Mark items read individually, or use “Mark all read”.",
    ],
  },
];

const TASKS: HelpSection = {
  title: "Tasks & Kanban",
  icon: SquareKanban,
  points: [
    "The Kanban board groups your work into columns (To Do, In Progress, On Hold, Review, Done). Drag a card between columns to change its status.",
    "Moving a card to On Hold asks for a short reason so the team knows why it’s paused.",
    "Click a card to open its details — description, project, assignees, attachments and comments.",
    "Use the date filter’s “Next 7/30/90 days” and “Overdue” presets to focus on what’s due soon.",
  ],
};

const SECTIONS_BY_ROLE: Record<Role, HelpSection[]> = {
  ADMIN: [
    {
      title: "Users & roles",
      icon: Users,
      points: [
        "Create and edit users from User Management. Each user has a role (Admin, HR, Employee), an optional department, and a position.",
        "A user’s department powers department-wide task assignment and the department views.",
      ],
    },
    {
      title: "Projects",
      icon: Briefcase,
      points: [
        "Create projects and add members. Project members are the people eligible to be assigned that project’s tasks.",
        "Open a project to see its tasks, members and spending.",
      ],
    },
    {
      title: "Tasks & assignment",
      icon: ClipboardList,
      points: [
        "Create a task from the “Quick” menu. Choose how to assign it: Individual, Multiple people, or a whole Department.",
        "Leave the project as “General” for a company-wide or department task (e.g. an HR task) that isn’t tied to a project — this is how departments like HR appear in the assignment list.",
        "Only admins create, edit, complete or delete tasks; employees and HR progress their own tasks.",
        "Filter the task list/board by status and priority — pick several values at once to combine them.",
      ],
    },
    {
      title: "Expenses & reimbursements",
      icon: Wallet,
      points: [
        "All Expenses shows every submitted expense; filter by status, category or project, and by expense date or submission date.",
        "Mark approved expenses as paid from Reimbursements; the date filter there windows by the paid date.",
      ],
    },
    {
      title: "Departments",
      icon: Building2,
      points: [
        "Departments are derived from users’ department field. Open a department to see its people and tasks.",
      ],
    },
    {
      title: "Reports",
      icon: BarChart3,
      points: [
        "Reports summarise spend and activity across tabs. Use the date range to scope the figures, and export where available.",
      ],
    },
    {
      title: "Help Desk",
      icon: LifeBuoy,
      points: [
        "Tickets are routed to HR or System teams. Track and respond to requests from the Help Desk.",
      ],
    },
  ],
  HR: [
    {
      title: "Reviewing expenses",
      icon: ClipboardCheck,
      points: [
        "The Review queue lists expenses awaiting a decision. The board windows by submission date, so “Today” means what arrived today.",
        "Open an expense to approve or reject it with a remark; the table shows both the expense date and the submitted date.",
      ],
    },
    {
      title: "Reimbursements",
      icon: HandCoins,
      points: [
        "View approved expenses and their payment status. This view is read-only for HR.",
      ],
    },
    {
      title: "Employees",
      icon: Users,
      points: [
        "Browse people, their departments and status from the Employees page.",
      ],
    },
    { ...TASKS, points: [
      "Your Kanban and My Tasks show only the tasks assigned to you or to your department — not every company task.",
      ...TASKS.points,
    ] },
    {
      title: "Reports",
      icon: BarChart3,
      points: ["Use HR reports to see expense and activity trends; scope them with the date range."],
    },
    {
      title: "Help Desk",
      icon: LifeBuoy,
      points: ["Raise and track tickets, and handle requests routed to the HR team."],
    },
  ],
  EMPLOYEE: [
    {
      title: "Submitting expenses",
      icon: Wallet,
      points: [
        "Start from “Submit Expense”. Upload a receipt and the system extracts the details for you to verify, or enter a cash expense manually.",
        "Track each expense’s approval and reimbursement status from My Expenses. Drafts can be edited or deleted before submission.",
      ],
    },
    TASKS,
    {
      title: "Help Desk",
      icon: LifeBuoy,
      points: [
        "Raise a ticket for HR or system issues from the Help Desk, and follow its updates.",
      ],
    },
  ],
};

/** Role-aware example prompts to seed the Ask box. */
const SUGGESTIONS_BY_ROLE: Record<Role, string[]> = {
  ADMIN: [
    "How do I assign a task to a whole department?",
    "Where do I mark an approved expense as paid?",
    "How are departments created?",
  ],
  HR: [
    "How do I approve or reject an expense?",
    "What does the Review queue window by?",
    "Which tasks show on my Kanban board?",
  ],
  EMPLOYEE: [
    "How do I submit an expense from a receipt?",
    "How do I change a task's status?",
    "How do I raise a Help Desk ticket?",
  ],
};

/** Grounded AI Q&A over the user manual, scoped to the current user's role. */
function AskManualPanel() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<HelpAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const suggestions = user ? SUGGESTIONS_BY_ROLE[user.role] : [];

  async function ask(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 3 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await askManual(trimmed);
      setAnswer(result);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't get an answer. Please try again."));
      setAnswer(null);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(question);
  }

  function handleSuggestion(s: string) {
    setQuestion(s);
    void ask(s);
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-[18px]" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Ask the manual
          </h2>
          <p className="text-sm text-muted-foreground">
            Ask in your own words — answers come only from this manual, scoped to
            your role.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(question);
            }
          }}
          placeholder="e.g. How do I submit an expense?"
          rows={2}
          maxLength={500}
          disabled={loading}
          className="resize-none"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            Press Enter to ask, Shift+Enter for a new line.
          </span>
          <Button
            type="submit"
            size="sm"
            disabled={loading || question.trim().length < 3}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {loading ? "Asking…" : "Ask"}
          </Button>
        </div>
      </form>

      {suggestions.length > 0 && !answer && !loading && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSuggestion(s)}
              className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {answer && (
        <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-4">
          <p className="text-sm leading-relaxed whitespace-pre-line text-foreground">
            {answer.answer}
          </p>
          {answer.sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs font-medium text-muted-foreground">
                Sources:
              </span>
              {answer.sources.map((src) => (
                <span
                  key={src}
                  className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                >
                  {src}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function HelpPage() {
  const { user } = useAuth();
  const sections = [...COMMON, ...(user ? SECTIONS_BY_ROLE[user.role] : [])];

  return (
    <>
      <PageHeader
        title="Help & User Manual"
        description="How OpsFlow works for your role — ask a question or browse the guides below."
        breadcrumbs={[{ label: "Help" }]}
      />

      <div className="mb-4">
        <AskManualPanel />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Card key={section.title} className="flex flex-col gap-3 p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-[18px]" />
                </span>
                <h2 className="text-base font-semibold text-foreground">
                  {section.title}
                </h2>
              </div>
              <ul className="flex flex-col gap-2">
                {section.points.map((point, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
                  >
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/50" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
