import { CalendarDays } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DATE_PRESETS,
  makeRange,
  type DateRange,
  type DateRangePreset,
} from "../../lib/date-range";

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
  /** Hide the leading calendar icon (e.g. in already-dense toolbars). */
  hideIcon?: boolean;
}

/**
 * The global date-range filter: a preset selector that reveals two date inputs
 * for the custom range. Controlled — the parent owns the {@link DateRange} and
 * applies it to its data via `filterByDate`.
 */
export function DateRangeFilter({
  value,
  onChange,
  className,
  hideIcon,
}: DateRangeFilterProps) {
  return (
    <div className={cn("no-print flex flex-wrap items-center gap-2", className)}>
      <div className="flex flex-1 items-center gap-1.5 sm:flex-initial">
        {!hideIcon && <CalendarDays className="size-4 shrink-0 text-muted-foreground" />}
        <Select
          value={value.preset}
          onValueChange={(v) =>
            onChange(makeRange(v as DateRangePreset, value.customStart, value.customEnd))
          }
        >
          <SelectTrigger size="sm" className="w-full sm:w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.preset === "custom" && (
        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <Input
            type="date"
            aria-label="From date"
            value={value.customStart ?? ""}
            max={value.customEnd || undefined}
            onChange={(e) => onChange(makeRange("custom", e.target.value, value.customEnd))}
            className="h-8 w-full sm:w-[150px]"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To date"
            value={value.customEnd ?? ""}
            min={value.customStart || undefined}
            onChange={(e) => onChange(makeRange("custom", value.customStart, e.target.value))}
            className="h-8 w-full sm:w-[150px]"
          />
        </div>
      )}
    </div>
  );
}
