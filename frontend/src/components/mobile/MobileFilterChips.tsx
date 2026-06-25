import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

/**
 * Renders the currently-active filters as removable chips below the search /
 * Filters row, so users can see and clear filters at a glance on mobile.
 */
export function MobileFilterChips({
  chips,
  className,
}: {
  chips: FilterChip[];
  className?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/60 py-1 pr-1.5 pl-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <span className="truncate">{chip.label}</span>
          <X className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}
