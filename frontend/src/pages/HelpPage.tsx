import { useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  ClipboardCheck,
  ClipboardList,
  HandCoins,
  HelpCircle,
  LifeBuoy,
  Search,
  SquareKanban,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "../components/layout/PageHeader";
import { EmptyState } from "../components/common/EmptyState";
import { useAuth } from "../context/auth-context";
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

export function HelpPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");

  const sections = useMemo(() => {
    const all = [...COMMON, ...(user ? SECTIONS_BY_ROLE[user.role] : [])];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.points.some((p) => p.toLowerCase().includes(q)),
    );
  }, [user, query]);

  return (
    <>
      <PageHeader
        title="Help & User Manual"
        description="How OpsFlow works for your role — search or browse the guides below."
        breadcrumbs={[{ label: "Help" }]}
        actions={
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help…"
              className="h-9 pl-8"
            />
          </div>
        }
      />

      {sections.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={HelpCircle}
            title="No help topics match"
            description={`Nothing found for “${query.trim()}”. Try a different word.`}
          />
        </Card>
      ) : (
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
      )}
    </>
  );
}
