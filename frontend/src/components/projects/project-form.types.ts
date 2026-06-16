import type { CreateProjectPayload, ProjectStatus } from "../../types/project";

export interface ProjectFormValues {
  name: string;
  description: string;
  clientName: string;
  /** Held as a string for the number input; parsed on submit. */
  budget: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
}

export const emptyProjectForm: ProjectFormValues = {
  name: "",
  description: "",
  clientName: "",
  budget: "",
  status: "PLANNING",
  startDate: "",
  endDate: "",
};

/** Client-side validation + transform from form strings to an API payload. */
export function buildProjectPayload(
  values: ProjectFormValues,
): { payload: CreateProjectPayload } | { error: string } {
  const budget = Number(values.budget);
  if (values.budget.trim() === "" || !Number.isFinite(budget) || budget < 0) {
    return { error: "Budget must be a non-negative number." };
  }
  if (
    values.startDate &&
    values.endDate &&
    Date.parse(values.endDate) < Date.parse(values.startDate)
  ) {
    return { error: "End date must be on or after the start date." };
  }
  return {
    payload: {
      name: values.name.trim(),
      description: values.description.trim(),
      clientName: values.clientName.trim(),
      budget,
      status: values.status,
      startDate: values.startDate,
      endDate: values.endDate,
    },
  };
}
