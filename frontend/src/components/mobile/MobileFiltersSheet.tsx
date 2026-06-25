import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * Mobile-native filter entry point: a single "Filters" button (with an active
 * count badge) that opens a bottom sheet holding the page's filter controls —
 * replacing a row of dropdowns on small screens. Render it `md:hidden` and keep
 * the desktop inline toolbar at `hidden md:flex`.
 */
export function MobileFiltersSheet({
  children,
  activeCount = 0,
  onClear,
  className,
  title = "Filters",
}: {
  children: ReactNode;
  activeCount?: number;
  onClear?: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" className={className}>
            <SlidersHorizontal className="size-4" />
            {title}
            {activeCount > 0 && (
              <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                {activeCount}
              </span>
            )}
          </Button>
        }
      />
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {onClear && activeCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-medium text-primary hover:underline"
            >
              Clear all
            </button>
          )}
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">{children}</SheetBody>
        <SheetFooter>
          <SheetClose
            render={<Button className="w-full">Show results</Button>}
          />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
