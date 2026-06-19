import { Info, PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Secondary, clearly-discoverable entry point to the manual (no-receipt) flow.
 * Collapsed by default with deliberately secondary visual weight so it never
 * competes with the primary "Upload Receipt" path. When open it reveals the
 * manual form (children) and explains that manual expenses may need extra review.
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
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Manual expenses have no receipt and may require additional review.
          </span>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
