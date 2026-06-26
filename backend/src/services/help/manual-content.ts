/**
 * Role-scoped User Manual content — the single source of truth the Help Q&A AI
 * grounds its answers on.
 *
 * IMPORTANT: this MUST be kept in sync with the static manual cards rendered in
 * `frontend/src/pages/HelpPage.tsx` (COMMON + SECTIONS_BY_ROLE). The frontend
 * owns the visual cards; this module owns the same text so the backend can
 * answer questions without inventing OpsFlow features it cannot read here.
 */

export type ManualRole = "ADMIN" | "HR" | "EMPLOYEE";

export interface ManualSection {
  title: string;
  /** Short how-to steps / tips. */
  points: string[];
}

/** Navigation tips everyone shares, regardless of role. */
const COMMON: ManualSection[] = [
  {
    title: "Getting around",
    points: [
      "Use the left sidebar to switch between modules. On mobile, the bottom bar holds your most-used pages and “More” opens the full menu.",
      "Press ⌘K (or Ctrl+K) anywhere to open search — find a task, project, person, or expense by name or code (e.g. TSK-12, EXP-0041), or type a page name like “Reports” to jump straight there.",
      "The “Quick” button in the top bar gives one-click shortcuts for the things your role does most.",
      "The date filter on list and board pages is remembered as you move around; the badge next to it shows the active range.",
    ],
  },
  {
    title: "Notifications",
    points: [
      "The bell icon next to your profile shows unread alerts — task assignments, status changes, comments and mentions, and ticket updates.",
      "Open the bell for a quick list, or visit the Notifications page (from the bell’s footer) to filter by type, unread-only, or date.",
      "Mark items read individually, or use “Mark all read”.",
    ],
  },
];

const TASKS: ManualSection = {
  title: "Tasks & Kanban",
  points: [
    "The Kanban board groups your work into columns (To Do, In Progress, On Hold, Review, Done). Drag a card between columns to change its status.",
    "Moving a card to On Hold asks for a short reason so the team knows why it’s paused.",
    "Click a card to open its details — description, project, assignees, attachments and comments.",
    "Use the date filter’s “Next 7/30/90 days” and “Overdue” presets to focus on what’s due soon.",
  ],
};

const SECTIONS_BY_ROLE: Record<ManualRole, ManualSection[]> = {
  ADMIN: [
    {
      title: "Users & roles",
      points: [
        "Create and edit users from User Management. Each user has a role (Admin, HR, Employee), an optional department, and a position.",
        "A user’s department powers department-wide task assignment and the department views.",
      ],
    },
    {
      title: "Projects",
      points: [
        "Create projects and add members. Project members are the people eligible to be assigned that project’s tasks.",
        "Open a project to see its tasks, members and spending.",
      ],
    },
    {
      title: "Tasks & assignment",
      points: [
        "Create a task from the “Quick” menu. Choose how to assign it: Individual, Multiple people, or a whole Department.",
        "Leave the project as “General” for a company-wide or department task (e.g. an HR task) that isn’t tied to a project — this is how departments like HR appear in the assignment list.",
        "Only admins create, edit, complete or delete tasks; employees and HR progress their own tasks.",
        "Filter the task list/board by status and priority — pick several values at once to combine them.",
      ],
    },
    {
      title: "Expenses & reimbursements",
      points: [
        "All Expenses shows every submitted expense; filter by status, category or project, and by expense date or submission date.",
        "Mark approved expenses as paid from Reimbursements; the date filter there windows by the paid date.",
      ],
    },
    {
      title: "Departments",
      points: [
        "Departments are derived from users’ department field. Open a department to see its people and tasks.",
      ],
    },
    {
      title: "Reports",
      points: [
        "Reports summarise spend and activity across tabs. Use the date range to scope the figures, and export where available.",
      ],
    },
    {
      title: "Help Desk",
      points: [
        "Tickets are routed to HR or System teams. Track and respond to requests from the Help Desk.",
      ],
    },
  ],
  HR: [
    {
      title: "Reviewing expenses",
      points: [
        "The Review queue lists expenses awaiting a decision. The board windows by submission date, so “Today” means what arrived today.",
        "Open an expense to approve or reject it with a remark; the table shows both the expense date and the submitted date.",
      ],
    },
    {
      title: "Reimbursements",
      points: [
        "View approved expenses and their payment status. This view is read-only for HR.",
      ],
    },
    {
      title: "Employees",
      points: [
        "Browse people, their departments and status from the Employees page.",
      ],
    },
    {
      ...TASKS,
      points: [
        "Your Kanban and My Tasks show only the tasks assigned to you or to your department — not every company task.",
        ...TASKS.points,
      ],
    },
    {
      title: "Reports",
      points: [
        "Use HR reports to see expense and activity trends; scope them with the date range.",
      ],
    },
    {
      title: "Help Desk",
      points: ["Raise and track tickets, and handle requests routed to the HR team."],
    },
  ],
  EMPLOYEE: [
    {
      title: "Submitting expenses",
      points: [
        "Start from “Submit Expense”. Upload a receipt and the system extracts the details for you to verify, or enter a cash expense manually.",
        "Track each expense’s approval and reimbursement status from My Expenses. Drafts can be edited or deleted before submission.",
      ],
    },
    TASKS,
    {
      title: "Help Desk",
      points: [
        "Raise a ticket for HR or system issues from the Help Desk, and follow its updates.",
      ],
    },
  ],
};

/**
 * Coerce an arbitrary (client/JWT-sourced) role string to a known manual role.
 * Unknown roles fall back to EMPLOYEE (least privilege) so an unexpected value
 * never leaks admin-only manual content.
 */
export function normalizeManualRole(role: string | undefined): ManualRole {
  if (role === "ADMIN" || role === "HR") return role;
  return "EMPLOYEE";
}

/**
 * The manual a given role is allowed to see: shared COMMON navigation tips plus
 * the role's own sections. This is the exact, role-scoped grounding corpus.
 */
export function getManualForRole(role: ManualRole): ManualSection[] {
  return [...COMMON, ...SECTIONS_BY_ROLE[role]];
}
