import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "../../components/common/EmptyState";
import { PageHeader } from "../../components/layout/PageHeader";
import { UserForm } from "../../components/users/UserForm";
import type { UserFormValues } from "../../components/users/user-form.types";
import {
  apiErrorMessage,
  getUser,
  setUserStatus,
  updateUser,
} from "../../lib/users-api";
import type { UpdateUserPayload } from "../../types/user";

export function EditUserPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [initial, setInitial] = useState<UserFormValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const userId = id;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const user = await getUser(userId);
        if (!cancelled) {
          setInitial({
            name: user.name,
            email: user.email,
            password: "",
            role: user.role,
            department: user.department ?? "",
            isActive: user.isActive,
          });
        }
      } catch (err) {
        if (!cancelled) setLoadError(apiErrorMessage(err, "User not found."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSubmit(values: UserFormValues) {
    if (!id || !initial) return;
    setSubmitting(true);
    setSubmitError(null);

    const payload: UpdateUserPayload = {
      name: values.name.trim(),
      email: values.email.trim(),
      role: values.role,
      department: values.department.trim(),
    };

    try {
      await updateUser(id, payload);
      // Status lives on a dedicated endpoint; only call it when it changed.
      if (values.isActive !== initial.isActive) {
        await setUserStatus(id, values.isActive);
      }
      navigate("/admin/users");
    } catch (err) {
      setSubmitError(apiErrorMessage(err, "Failed to update user."));
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Edit User"
        breadcrumbs={[
          { label: "Admin", to: "/admin" },
          { label: "User Management", to: "/admin/users" },
          { label: "Edit" },
        ]}
      />

      {loading ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border p-6">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      ) : loadError || !initial ? (
        <EmptyState
          icon={TriangleAlert}
          title="Couldn't load user"
          description={loadError ?? "This user could not be found."}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/admin/users")}
            >
              Back to users
            </Button>
          }
        />
      ) : (
        <UserForm
          mode="edit"
          initialValues={initial}
          submitting={submitting}
          error={submitError}
          onSubmit={handleSubmit}
          onCancel={() => navigate("/admin/users")}
        />
      )}
    </>
  );
}
