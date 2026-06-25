import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectFilterProps {
  /** Short field label, e.g. "Status". */
  label: string;
  options: MultiSelectOption[];
  /** Currently selected values. Empty = no filter (all). */
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
}

/**
 * A filter that holds multiple values at once (OR within the field). Empty
 * selection means "all". Drop-in companion to the single-value Select filters;
 * the menu stays open while toggling so several values can be picked at once.
 */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  className,
}: MultiSelectFilterProps) {
  const toggle = (v: string) =>
    onChange(
      selected.includes(v)
        ? selected.filter((x) => x !== v)
        : [...selected, v],
    );

  const summary =
    selected.length === 0
      ? "All"
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? "1")
        : `${selected.length} selected`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 justify-between gap-1.5", className)}
          >
            <span className="text-muted-foreground">{label}:</span>
            <span className="truncate font-medium text-foreground">
              {summary}
            </span>
            <ChevronDown className="size-3.5 shrink-0 opacity-70" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-52">
        <div className="flex items-center justify-between px-1.5 py-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={() => toggle(o.value)}
            closeOnClick={false}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
