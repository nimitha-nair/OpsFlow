import { useState } from "react";
import type { FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Role } from "../../types/auth";
import type { UserFormValues } from "./user-form.types";

interface UserFormProps {
  mode: "create" | "edit";
  initialValues: UserFormValues;
  submitting: boolean;
  error: string | null;
  onSubmit: (values: UserFormValues) => void;
  onCancel: () => void;
}

export function UserForm({
  mode,
  initialValues,
  submitting,
  error,
  onSubmit,
  onCancel,
}: UserFormProps) {
  const [values, setValues] = useState<UserFormValues>(initialValues);

  function set<K extends keyof UserFormValues>(key: K, value: UserFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="grid grid-cols-1 gap-5 pt-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              required
              placeholder="Jane Doe"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={values.email}
              onChange={(e) => set("email", e.target.value)}
              required
              placeholder="jane@opsflow.local"
            />
          </div>

          {mode === "create" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={values.password}
                onChange={(e) => set("password", e.target.value)}
                required
                minLength={8}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={values.role}
              onValueChange={(value) => set("role", value as Role)}
            >
              <SelectTrigger id="role" className="w-full">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="HR">HR</SelectItem>
                <SelectItem value="EMPLOYEE">Employee</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="department">Department</Label>
            <Input
              id="department"
              value={values.department}
              onChange={(e) => set("department", e.target.value)}
              placeholder="e.g. Engineering"
              maxLength={100}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="position">Position</Label>
            <Input
              id="position"
              value={values.position}
              onChange={(e) => set("position", e.target.value)}
              placeholder="e.g. Software Engineer"
              maxLength={100}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={values.isActive ? "active" : "inactive"}
              onValueChange={(value) => set("isActive", value === "active")}
            >
              <SelectTrigger id="status" className="w-full">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {error}
            </p>
          )}
        </CardContent>

        <CardFooter className="justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {mode === "create" ? "Create User" : "Save Changes"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
