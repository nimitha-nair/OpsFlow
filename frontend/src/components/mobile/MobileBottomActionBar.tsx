import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A full-width contextual action bar pinned to the bottom on mobile (bulk
 * actions, a primary CTA, etc.). It sits ABOVE the bottom navigation and the
 * safe-area inset, so it never covers the nav or runs under the home indicator.
 * Hidden on desktop (`md:hidden`) — desktop surfaces keep their own affordance.
 */
export function MobileBottomActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "no-print fixed inset-x-0 z-40 flex items-center gap-2 border-t border-border bg-background/95 px-3 py-2.5 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)] backdrop-blur md:hidden",
        // Clear the fixed bottom nav (~3.5rem) plus the device safe-area.
        "bottom-[calc(3.5rem+env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {children}
    </div>
  );
}
