import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { PageHeader } from "../../components/layout/PageHeader";
import { UserForm } from "../../components/users/UserForm";
import {
  emptyUserForm,
  type UserFormValues,
} from "../../components/users/user-form.types";
import { apiErrorMessage, createUser } from "../../lib/users-api";
import type { CreateUserPayload } from "../../types/user";

export function CreateUserPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: UserFormValues) {
    setSubmitting(true);
    setError(null);

    const payload: CreateUserPayload = {
      name: values.name.trim(),
      email: values.email.trim(),
      password: values.password,
      role: values.role,
      isActive: values.isActive,
      ...(values.department.trim()
        ? { department: values.department.trim() }
        : {}),
    };

    try {
      await createUser(payload);
      navigate("/admin/users");
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to create user."));
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Create User"
        breadcrumbs={[
          { label: "Admin", to: "/admin" },
          { label: "User Management", to: "/admin/users" },
          { label: "Create" },
        ]}
      />
      <UserForm
        mode="create"
        initialValues={emptyUserForm}
        submitting={submitting}
        error={error}
        onSubmit={handleSubmit}
        onCancel={() => navigate("/admin/users")}
      />
    </>
  );
}
