import { useMemo } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AssignmentInput, AssignmentType, TaskAssignment } from "../../types/task";

/** A project member eligible for assignment. */
export interface MemberOption {
  id: string;
  name: string;
  /** The member's department, used to power DEPARTMENT assignment. */
  department?: string;
}

/** Editor draft state for an assignment. Kept flat for simple useState. */
export interface AssignmentDraft {
  type: AssignmentType;
  /** Selected user ids (INDIVIDUAL: 0..1, MULTIPLE: 0..n). */
  userIds: string[];
  /** Selected department (DEPARTMENT only). */
  department: string;
}

const TYPES: { value: AssignmentType; label: string }[] = [
  { value: "INDIVIDUAL", label: "Individual" },
  { value: "MULTIPLE", label: "Multiple" },
  { value: "DEPARTMENT", label: "Department" },
];

const UNASSIGNED = "Unassigned";

/** Initialise the editor draft from an existing task assignment (edit mode). */
export function draftFromAssignment(a: TaskAssignment | undefined): AssignmentDraft {
  if (!a) return { type: "INDIVIDUAL", userIds: [], department: "" };
  if (a.type === "DEPARTMENT") {
    return { type: "DEPARTMENT", userIds: [], department: a.department ?? "" };
  }
  return { type: a.type, userIds: [...a.userIds], department: "" };
}

/** Distinct departments present among the given members. */
function departmentsOf(members: MemberOption[]): string[] {
  return [
    ...new Set(members.map((m) => m.department?.trim() || UNASSIGNED)),
  ].sort();
}

/** True when the draft is a complete, submittable assignment. */
export function isAssignmentValid(draft: AssignmentDraft): boolean {
  if (draft.type === "INDIVIDUAL") return draft.userIds.length === 1;
  if (draft.type === "MULTIPLE") return draft.userIds.length >= 2;
  return draft.department.trim() !== "";
}

/** Build the outgoing payload union from a valid draft (else null). */
export function assignmentInputFromDraft(
  draft: AssignmentDraft,
): AssignmentInput | null {
  if (!isAssignmentValid(draft)) return null;
  if (draft.type === "INDIVIDUAL") {
    return { type: "INDIVIDUAL", userIds: [draft.userIds[0]!] };
  }
  if (draft.type === "MULTIPLE") {
    return { type: "MULTIPLE", userIds: [...draft.userIds] };
  }
  return { type: "DEPARTMENT", department: draft.department };
}

interface AssignmentFieldProps {
  value: AssignmentDraft;
  onChange: (next: AssignmentDraft) => void;
  members: MemberOption[];
  disabled?: boolean;
  /** Placeholder shown when no project/members are loaded yet. */
  placeholder?: string;
  idPrefix?: string;
}

/**
 * Shared assignment editor: a type toggle (Individual | Multiple | Department)
 * over project members, producing an AssignmentInput on submit.
 */
export function AssignmentField({
  value,
  onChange,
  members,
  disabled,
  placeholder,
  idPrefix = "assignment",
}: AssignmentFieldProps) {
  const departments = useMemo(() => departmentsOf(members), [members]);
  const deptCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const member of members) {
      const d = member.department?.trim() || UNASSIGNED;
      m.set(d, (m.get(d) ?? 0) + 1);
    }
    return m;
  }, [members]);

  function setType(type: AssignmentType) {
    // Reset selection that no longer applies when switching modes.
    onChange({
      type,
      userIds:
        type === "DEPARTMENT"
          ? []
          : type === "INDIVIDUAL"
            ? value.userIds.slice(0, 1)
            : value.userIds,
      department: type === "DEPARTMENT" ? value.department : "",
    });
  }

  function toggleUser(id: string) {
    const has = value.userIds.includes(id);
    onChange({
      ...value,
      userIds: has
        ? value.userIds.filter((u) => u !== id)
        : [...value.userIds, id],
    });
  }

  const noMembers = members.length === 0;

  return (
    <div className="flex flex-col gap-2">
      <Label>Assignment</Label>

      {/* Type toggle */}
      <div className="inline-flex w-fit rounded-lg border border-border bg-muted/40 p-0.5">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            disabled={disabled}
            onClick={() => setType(t.value)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              value.type === t.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              disabled && "opacity-50",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {value.type === "INDIVIDUAL" && (
        <Select
          value={value.userIds[0] ?? ""}
          onValueChange={(v) =>
            onChange({ ...value, userIds: v ? [v] : [] })
          }
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-individual`} className="w-full">
            <SelectValue
              placeholder={placeholder ?? "Select a team member"}
            />
          </SelectTrigger>
          <SelectContent>
            {noMembers ? (
              <SelectItem value="__none" disabled>
                No people available
              </SelectItem>
            ) : (
              members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      )}

      {value.type === "MULTIPLE" && (
        <div className="flex max-h-44 flex-col gap-0.5 overflow-y-auto rounded-lg border border-border p-1">
          {noMembers ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              No people available
            </p>
          ) : (
            members.map((m) => {
              const checked = value.userIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleUser(m.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                    checked && "bg-muted/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-transparent",
                    )}
                  >
                    <Check className="size-3" />
                  </span>
                  <span className="truncate">{m.name}</span>
                </button>
              );
            })
          )}
          {!noMembers && value.userIds.length < 2 && (
            <p className="px-2 pt-1 text-[11px] text-muted-foreground">
              Select at least 2 members.
            </p>
          )}
        </div>
      )}

      {value.type === "DEPARTMENT" && (
        <>
          <Select
            value={value.department}
            onValueChange={(v) =>
              onChange({ ...value, department: v ?? "" })
            }
            disabled={disabled}
          >
            <SelectTrigger id={`${idPrefix}-department`} className="w-full">
              <SelectValue placeholder="Select a department" />
            </SelectTrigger>
            <SelectContent>
              {departments.length === 0 ? (
                <SelectItem value="__none" disabled>
                  No departments found
                </SelectItem>
              ) : (
                departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {value.department && (
            <p className="text-[11px] text-muted-foreground">
              {deptCounts.get(value.department) ?? 0} member
              {(deptCounts.get(value.department) ?? 0) === 1 ? "" : "s"} in this
              department
            </p>
          )}
        </>
      )}
    </div>
  );
}
