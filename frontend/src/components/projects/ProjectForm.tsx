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
import { Textarea } from "@/components/ui/textarea";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from "../../types/project";
import type { ProjectFormValues } from "./project-form.types";

interface ProjectFormProps {
  mode: "create" | "edit";
  initialValues: ProjectFormValues;
  submitting: boolean;
  error: string | null;
  onSubmit: (values: ProjectFormValues) => void;
  onCancel: () => void;
}

export function ProjectForm({
  mode,
  initialValues,
  submitting,
  error,
  onSubmit,
  onCancel,
}: ProjectFormProps) {
  const [values, setValues] = useState<ProjectFormValues>(initialValues);

  function set<K extends keyof ProjectFormValues>(
    key: K,
    value: ProjectFormValues[K],
  ) {
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
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="name">Project name</Label>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              required
              placeholder="Apollo Platform"
            />
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              required
              rows={3}
              placeholder="Short summary of the project scope"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="clientName">Client</Label>
            <Input
              id="clientName"
              value={values.clientName}
              onChange={(e) => set("clientName", e.target.value)}
              required
              placeholder="Acme Inc."
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="budget">Budget (USD)</Label>
            <Input
              id="budget"
              type="number"
              min={0}
              step={1}
              value={values.budget}
              onChange={(e) => set("budget", e.target.value)}
              required
              placeholder="50000"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={values.status}
              onValueChange={(value) => set("status", value as ProjectStatus)}
            >
              <SelectTrigger id="status" className="w-full">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {PROJECT_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:col-span-1">
            <div className="flex flex-col gap-2">
              <Label htmlFor="startDate">Start date</Label>
              <Input
                id="startDate"
                type="date"
                value={values.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="endDate">End date</Label>
              <Input
                id="endDate"
                type="date"
                value={values.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                required
              />
            </div>
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
            {mode === "create" ? "Create Project" : "Save Changes"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
