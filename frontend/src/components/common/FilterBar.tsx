import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A consistent filter / toolbar row: wraps on small screens, centres its
 * controls, and uses a uniform gap. Pair with `size="sm"` controls (h-8) for a
 * tidy toolbar that lines up across every list page.
 */
export function FilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}
