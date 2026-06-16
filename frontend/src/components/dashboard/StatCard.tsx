import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
}

export function StatCard({ label, value, icon: Icon, hint }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </div>
          <div className="truncate text-xs text-muted-foreground">{label}</div>
          {hint && (
            <div className="truncate text-xs text-muted-foreground/80">
              {hint}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
