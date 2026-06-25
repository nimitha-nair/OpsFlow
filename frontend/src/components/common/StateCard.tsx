import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Wraps a Loading / Error / Empty state in a consistently padded card, so
 * those states look the same on every list and detail page.
 */
export function StateCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <Card className={cn("p-6", className)}>{children}</Card>;
}
