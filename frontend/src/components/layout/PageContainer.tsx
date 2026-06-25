import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Standard page content wrapper — gives every page one consistent vertical
 * rhythm (gap-6 between major sections) so spacing doesn't drift per page.
 */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-col gap-6", className)}>{children}</div>;
}
