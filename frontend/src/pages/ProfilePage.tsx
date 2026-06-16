import { useEffect, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingState } from "../components/common/LoadingState";
import { PageHeader } from "../components/layout/PageHeader";
import { formatDate } from "../lib/format";
import { apiErrorMessage, getMe } from "../lib/users-api";
import type { User } from "../types/user";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U"
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

export function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const me = await getMe();
        if (!cancelled) setUser(me);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load profile."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <>
      <PageHeader
        title="My Profile"
        description="Your account details."
        breadcrumbs={[{ label: "Profile" }]}
      />

      {loading ? (
        <LoadingState label="Loading profile…" />
      ) : error || !user ? (
        <ErrorState
          title="Couldn't load profile"
          description={error ?? "Your profile could not be loaded."}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <Avatar className="size-14">
              <AvatarFallback className="bg-primary/10 text-base font-medium text-primary">
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-1">
              <CardTitle className="text-lg">{user.name}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{user.role}</Badge>
                {user.position && (
                  <span className="text-sm text-muted-foreground">
                    {user.position}
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Email" value={user.email} />
              <Field label="Role (access level)" value={user.role} />
              <Field label="Position" value={user.position || "—"} />
              <Field label="Department" value={user.department || "—"} />
              <Field
                label="Status"
                value={user.isActive ? "Active" : "Inactive"}
              />
              <Field label="Member since" value={formatDate(user.createdAt)} />
            </dl>
          </CardContent>
        </Card>
      )}
    </>
  );
}
