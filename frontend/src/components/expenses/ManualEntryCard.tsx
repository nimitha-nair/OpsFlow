import { PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Secondary, clearly-discoverable entry point to the manual (no-receipt) flow.
 * Collapsed by default with deliberately secondary visual weight so it never
 * competes with the primary "Upload Receipt" path. When open it reveals the
 * manual form (children). The "may need extra review" concept is intentionally
 * NOT shown here — it belongs to the reviewer (HR) workflow, not the employee.
 */
export function ManualEntryCard({
  open,
  onOpen,
  children,
}: {
  open: boolean;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  if (!open) {
    return (
      <Card className="border-dashed bg-muted/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-foreground">
              Can&apos;t provide a receipt?
            </p>
            <p className="text-xs text-muted-foreground">
              Create a manual expense instead.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onOpen}>
            <PencilLine className="size-4" />
            Enter Manually
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-muted/20">
      <CardContent className="flex flex-col gap-4 pt-6">
        <p className="text-sm font-medium text-foreground">
          Enter the expense details
        </p>
        {children}
      </CardContent>
    </Card>
  );
}
