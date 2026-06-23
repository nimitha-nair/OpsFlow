import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Circle, Rocket, X } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface OnboardingStep {
  label: string;
  description?: string;
  /** Where the step's action link goes. */
  to: string;
  /** Whether this step is already satisfied by real data. */
  done: boolean;
}

interface GettingStartedProps {
  /** Stable key used to remember dismissal in localStorage. */
  storageKey: string;
  steps: OnboardingStep[];
  title?: string;
  description?: string;
}

function readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * A dismissible first-run checklist. Renders nothing once every step is done or
 * the user dismisses it (remembered per `storageKey`). Steps reflect real data
 * — callers pass `done` computed from the user's actual records.
 */
export function GettingStarted({
  storageKey,
  steps,
  title = "Get started",
  description = "A few steps to set up your workspace.",
}: GettingStartedProps) {
  const [dismissed, setDismissed] = useState(() => readDismissed(storageKey));

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = steps.length > 0 && doneCount === steps.length;

  if (dismissed || allDone || steps.length === 0) return null;

  function dismiss() {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // Ignore storage failures; just hide for this session.
    }
    setDismissed(true);
  }

  return (
    <Card className="relative overflow-hidden p-5">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 text-muted-foreground transition hover:text-foreground"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Rocket className="size-5" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">
            {description} · {doneCount} of {steps.length} done
          </p>
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-1">
        {steps.map((step) => (
          <li key={step.label}>
            <Link
              to={step.to}
              className={cn(
                "group flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition",
                step.done
                  ? "opacity-70"
                  : "hover:border-primary/40 hover:bg-muted/50",
              )}
            >
              {step.done ? (
                <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
              ) : (
                <Circle className="size-5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-sm font-medium",
                    step.done
                      ? "text-muted-foreground line-through"
                      : "text-foreground",
                  )}
                >
                  {step.label}
                </span>
                {step.description && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {step.description}
                  </span>
                )}
              </span>
              {!step.done && (
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
