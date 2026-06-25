import type { ReactNode } from "react";
import { MoreVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface MobileAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

/**
 * Collapses a set of secondary page actions into a single "⋯" overflow menu —
 * the mobile-native replacement for a wide desktop action toolbar. Render it
 * with `md:hidden` and keep the inline toolbar at `hidden md:flex`.
 */
export function MobileActionMenu({
  actions,
  label = "More actions",
  className,
}: {
  actions: MobileAction[];
  label?: string;
  className?: string;
}) {
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label={label}
            className={className}
          >
            <MoreVertical className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            onClick={action.onSelect}
            disabled={action.disabled}
            variant={action.destructive ? "destructive" : "default"}
          >
            {action.icon}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
