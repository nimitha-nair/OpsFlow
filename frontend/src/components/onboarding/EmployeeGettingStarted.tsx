import { useEffect, useState } from "react";

import { listMyExpenses } from "../../lib/expenses-api";
import { listMyTasks } from "../../lib/tasks-api";
import { listTickets } from "../../lib/tickets-api";
import { GettingStarted, type OnboardingStep } from "./GettingStarted";

const STORAGE_KEY = "opsflow.onboarding.employee";

function isDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Employee first-run checklist. Self-fetches the few signals it needs and
 * renders nothing until they load (or on error) so it never blocks the
 * dashboard. GettingStarted hides itself once all steps are done or dismissed.
 */
export function EmployeeGettingStarted() {
  const [steps, setSteps] = useState<OnboardingStep[] | null>(null);

  useEffect(() => {
    // Already dismissed — don't spend API calls fetching onboarding signals.
    if (isDismissed()) return;
    let cancelled = false;
    void (async () => {
      try {
        const [expenses, tasks, tickets] = await Promise.all([
          listMyExpenses(),
          listMyTasks(),
          listTickets(),
        ]);
        if (cancelled) return;
        setSteps([
          {
            label: "Submit your first expense",
            description: "Upload a receipt or enter one manually.",
            to: "/employee/expenses/new",
            done: expenses.length > 0,
          },
          {
            label: "Review your tasks",
            description: "See what's assigned to you on the board.",
            to: "/employee/tasks",
            done: tasks.length > 0,
          },
          {
            label: "Raise a help desk ticket",
            description: "Ask a question or report an issue.",
            to: "/employee/helpdesk",
            done: tickets.length > 0,
          },
        ]);
      } catch {
        // Non-fatal: simply render nothing if signals can't load.
        if (!cancelled) setSteps(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!steps) return null;
  return (
    <GettingStarted
      storageKey={STORAGE_KEY}
      title="Welcome to OpsFlow"
      description="A few steps to get going"
      steps={steps}
    />
  );
}
