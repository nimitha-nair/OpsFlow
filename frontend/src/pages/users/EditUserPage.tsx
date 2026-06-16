import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
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
            position: user.position ?? "",
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
      position: values.position.trim(),
    };

    try {
      await updateUser(id, payload);
      // Status lives on a dedicated endpoint; only call it when it changed.
      if (values.isActive !== initial.isActive) {
        await setUserStatus(id, values.isActive);
      }
      toast.success("User updated.");
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
        <LoadingState label="Loading user…" />
      ) : loadError || !initial ? (
        <ErrorState
          title="Couldn't load user"
          description={loadError ?? "This user could not be found."}
          onRetry={() => navigate("/admin/users")}
          retryLabel="Back to users"
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
