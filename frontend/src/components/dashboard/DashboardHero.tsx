import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "../../context/auth-context";

interface Cta {
  label: string;
  to: string;
  icon?: ReactNode;
}

interface DashboardHeroProps {
  title: string;
  /** Short status line shown under the greeting (the "within 5 seconds" summary). */
  status?: ReactNode;
  primary?: Cta;
  secondary?: Cta;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Dashboard home hero: a personalized greeting, the page title, a live status
 * summary, and a primary (+ optional secondary) call to action. Replaces the
 * static welcome banner so each home screen is useful at a glance.
 */
export function DashboardHero({
  title,
  status,
  primary,
  secondary,
}: DashboardHeroProps) {
  const { user } = useAuth();
  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <div className="r-rise relative mb-6 overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-indigo-500/12 via-violet-500/5 to-card p-6 sm:p-7">
      {/* Decorative glow. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-indigo-500/10 blur-3xl"
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {status && (
            <div className="mt-2 text-sm text-muted-foreground">{status}</div>
          )}
        </div>

        {(primary || secondary) && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {secondary && (
              <Link
                to={secondary.to}
                className={buttonVariants({ variant: "outline" })}
              >
                {secondary.icon}
                {secondary.label}
              </Link>
            )}
            {primary && (
              <Link
                to={primary.to}
                className={cn(
                  buttonVariants(),
                  "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm hover:opacity-90",
                )}
              >
                {primary.icon}
                {primary.label}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
