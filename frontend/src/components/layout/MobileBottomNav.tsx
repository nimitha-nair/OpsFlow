import { Menu } from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";
import { bottomNavByRole } from "../../lib/navigation";
import type { Role } from "../../types/auth";

/**
 * Thumb-reachable bottom navigation, shown only below `md`. Surfaces the four
 * primary destinations per role; the "More" slot opens the full drawer so every
 * route stays reachable without crowding the bar.
 */
export function MobileBottomNav({
  role,
  onMore,
}: {
  role: Role;
  onMore: () => void;
}) {
  const items = bottomNavByRole[role];

  const itemClass =
    "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors";

  return (
    <nav
      aria-label="Primary"
      className="no-print fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(itemClass, isActive ? "text-primary" : "text-muted-foreground")
            }
          >
            <Icon className="size-5" />
            {item.label}
          </NavLink>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        aria-label="More navigation"
        className={cn(itemClass, "text-muted-foreground")}
      >
        <Menu className="size-5" />
        More
      </button>
    </nav>
  );
}
