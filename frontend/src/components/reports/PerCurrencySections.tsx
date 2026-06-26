/**
 * Renders report content once per selected currency. With a single currency it
 * renders the content bare (today's layout, no heading); with several it wraps
 * each in a titled section with clean page breaks so the PDF mirrors the screen
 * and each currency paginates cleanly. Money is never merged across sections.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PerCurrencySectionsProps {
  /** Currencies to render, in display order. */
  currencies: string[];
  /** Render the scoped content for one currency. */
  children: (currency: string) => ReactNode;
}

export function PerCurrencySections({
  currencies,
  children,
}: PerCurrencySectionsProps) {
  if (currencies.length <= 1) {
    // Single (or no) currency → current layout, no heading.
    return <>{children(currencies[0] ?? "INR")}</>;
  }
  return (
    <div className="flex flex-col gap-6">
      {currencies.map((currency, i) => (
        <section
          key={currency}
          className={cn(
            "flex flex-col gap-5",
            // Each currency starts on a fresh page in the PDF (not the first).
            i > 0 && "break-before-page",
            "[break-inside:auto]",
          )}
        >
          <div className="flex items-center gap-3 border-b border-border pb-2">
            <span className="rounded-md bg-primary/10 px-2.5 py-1 text-sm font-bold tracking-wide text-primary">
              {currency}
            </span>
            <span className="text-xs text-muted-foreground">
              All figures below are in {currency} — currencies are never combined.
            </span>
          </div>
          {children(currency)}
        </section>
      ))}
    </div>
  );
}
