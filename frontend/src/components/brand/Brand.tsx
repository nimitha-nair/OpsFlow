import { Hexagon } from "lucide-react";

import { cn } from "@/lib/utils";

interface BrandProps {
  /** Show the "OpsFlow" wordmark + tagline next to the mark. */
  showWordmark?: boolean;
  className?: string;
}

/** The OpsFlow brand mark: a gradient badge + wordmark and tagline. */
export function Brand({ showWordmark = true, className }: BrandProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
        <Hexagon className="size-5" strokeWidth={2.25} />
      </span>
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span className="text-base font-semibold tracking-tight text-foreground">
            OpsFlow
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">
            HR Operations
          </span>
        </span>
      )}
    </div>
  );
}
