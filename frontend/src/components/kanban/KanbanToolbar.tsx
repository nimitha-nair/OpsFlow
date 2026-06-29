import type { ReactNode } from "react";
import {
  CalendarDays,
  GanttChart,
  Search,
  SquareKanban,
  User as UserIcon,
  Users,
  Building2,
  CheckCircle2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarClock, CalendarPlus } from "lucide-react";

import { DateRangeFilter } from "../common/DateRangeFilter";
import { DateBasisToggle } from "../common/DateBasisToggle";
import { MultiSelectFilter } from "../common/MultiSelectFilter";
import { MobileSearch } from "../mobile/MobileSearch";
import { MobileFiltersSheet } from "../mobile/MobileFiltersSheet";
import {
  MobileFilterChips,
  type FilterChip,
} from "../mobile/MobileFilterChips";
import {
  makeRange,
  rangeLabel,
  type DateRange,
  type DateRangePreset,
} from "../../lib/date-range";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskPriority,
  type TaskStatus,
} from "../../types/task";

export type SavedView = "my" | "team" | "department" | "completed";
export type BoardView = "board" | "calendar" | "timeline";

const VIEW_META: Record<SavedView, { label: string; icon: LucideIcon }> = {
  my: { label: "My Tasks", icon: UserIcon },
  team: { label: "Team Tasks", icon: Users },
  department: { label: "Department", icon: Building2 },
  completed: { label: "Completed", icon: CheckCircle2 },
};

const BOARD_VIEWS: { value: BoardView; icon: LucideIcon; label: string }[] = [
  { value: "board", icon: SquareKanban, label: "Board" },
  { value: "calendar", icon: CalendarDays, label: "Calendar" },
  { value: "timeline", icon: GanttChart, label: "Timeline" },
];

interface KanbanToolbarProps {
  views: SavedView[];
  activeView: SavedView;
  onViewChange: (v: SavedView) => void;

  search: string;
  onSearch: (v: string) => void;

  /** Selected priorities (empty = all). */
  priority: TaskPriority[];
  onPriority: (v: TaskPriority[]) => void;

  /** Selected statuses (empty = all). */
  status: TaskStatus[];
  onStatus: (v: TaskStatus[]) => void;

  versions: string[];
  versionFilter: string[];
  onVersion: (v: string[]) => void;

  projects: { id: string; name: string }[];
  projectFilter: string[];
  onProject: (v: string[]) => void;

  showDepartment: boolean;
  departments: string[];
  departmentFilter: string;
  onDepartment: (v: string) => void;

  dateRange: DateRange;
  onDateRange: (r: DateRange) => void;
  /** Preset options for the date filter (future-facing when windowing by due date). */
  datePresets?: { value: DateRangePreset; label: string }[];

  /** Optional Due/Created basis control, rendered beside the date range. */
  dateBasis?: {
    value: "dueDate" | "createdAt";
    onChange: (v: "dueDate" | "createdAt") => void;
  };

  boardView: BoardView;
  onBoardView: (v: BoardView) => void;

  counts: Record<SavedView, number>;
}

export function KanbanToolbar(props: KanbanToolbarProps) {
  // Active-filter summary, shared by the mobile Filters sheet + chips.
  const filterChips: FilterChip[] = [];
  for (const p of props.priority)
    filterChips.push({
      key: `priority:${p}`,
      label: TASK_PRIORITY_LABELS[p],
      onRemove: () =>
        props.onPriority(props.priority.filter((x) => x !== p)),
    });
  for (const s of props.status)
    filterChips.push({
      key: `status:${s}`,
      label: TASK_STATUS_LABELS[s],
      onRemove: () => props.onStatus(props.status.filter((x) => x !== s)),
    });
  if (props.versionFilter.length)
    filterChips.push({
      key: "version",
      label:
        props.versionFilter.length === 1
          ? `v${props.versionFilter[0]}`
          : `${props.versionFilter.length} versions`,
      onRemove: () => props.onVersion([]),
    });
  if (props.projectFilter.length)
    filterChips.push({
      key: "project",
      label:
        props.projectFilter.length === 1
          ? (props.projects.find((p) => p.id === props.projectFilter[0])?.name ?? "Project")
          : `${props.projectFilter.length} projects`,
      onRemove: () => props.onProject([]),
    });
  if (props.showDepartment && props.departmentFilter !== "all")
    filterChips.push({
      key: "department",
      label: props.departmentFilter,
      onRemove: () => props.onDepartment("all"),
    });
  if (props.dateRange.preset !== "all")
    filterChips.push({
      key: "range",
      label: rangeLabel(props.dateRange),
      onRemove: () => props.onDateRange(makeRange("all")),
    });
  const activeFilterCount = filterChips.length;
  function clearFilters() {
    props.onPriority([]);
    props.onStatus([]);
    props.onVersion([]);
    props.onProject([]);
    props.onDepartment("all");
    props.onDateRange(makeRange("all"));
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Saved views + visualization toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {props.views.map((v) => {
            const meta = VIEW_META[v];
            const Icon = meta.icon;
            const isActive = props.activeView === v;
            return (
              <button
                key={v}
                onClick={() => props.onViewChange(v)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {meta.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs tabular-nums",
                    isActive ? "bg-primary-foreground/20" : "bg-muted",
                  )}
                >
                  {props.counts[v]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {BOARD_VIEWS.map((bv) => {
            const Icon = bv.icon;
            const isActive = props.boardView === bv.value;
            return (
              <button
                key={bv.value}
                onClick={() => props.onBoardView(bv.value)}
                title={bv.label}
                aria-label={bv.label}
                className={cn(
                  "inline-flex items-center justify-center rounded-md p-1.5 transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop / tablet filter row (unchanged) */}
      <div className="hidden gap-2 md:flex md:flex-row md:flex-wrap md:items-center">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={props.search}
              onChange={(e) => props.onSearch(e.target.value)}
              placeholder="Search tasks…"
              className="h-8 pl-8"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <MultiSelectFilter
          label="Priority"
          options={TASK_PRIORITIES.map((p) => ({
            value: p,
            label: TASK_PRIORITY_LABELS[p],
          }))}
          selected={props.priority}
          onChange={(v) => props.onPriority(v as TaskPriority[])}
          className="w-full sm:w-40"
        />

        <MultiSelectFilter
          label="Status"
          options={TASK_STATUSES.map((s) => ({
            value: s,
            label: TASK_STATUS_LABELS[s],
          }))}
          selected={props.status}
          onChange={(v) => props.onStatus(v as TaskStatus[])}
          className="w-full sm:w-40"
        />

        {props.versions.length > 0 && (
          <MultiSelectFilter
            label="Version"
            options={props.versions.map((ver) => ({ value: ver, label: `v${ver}` }))}
            selected={props.versionFilter}
            onChange={props.onVersion}
            className="w-full sm:w-36"
          />
        )}

        {props.projects.length > 0 && (
          <MultiSelectFilter
            label="Project"
            options={props.projects.map((p) => ({ value: p.id, label: p.name }))}
            selected={props.projectFilter}
            onChange={props.onProject}
            className="w-full sm:w-44"
          />
        )}

        {props.showDepartment && props.departments.length > 0 && (
          <Select
            value={props.departmentFilter}
            onValueChange={(v) => props.onDepartment(v ?? "all")}
          >
            <SelectTrigger size="sm" className="w-full sm:w-44">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {props.departments.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {props.dateBasis && (
          <DateBasisToggle
            value={props.dateBasis.value}
            onChange={props.dateBasis.onChange}
            options={[
              { value: "dueDate", label: "Due date", Icon: CalendarClock },
              {
                value: "createdAt",
                label: "Created date",
                Icon: CalendarPlus,
              },
            ]}
          />
        )}
        <DateRangeFilter
          value={props.dateRange}
          onChange={props.onDateRange}
          presets={props.datePresets}
          className="w-full sm:w-auto"
        />
        </div>
      </div>

      {/* Mobile: native search + Filters bottom sheet + active-filter chips */}
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex items-center gap-2">
          <MobileSearch
            value={props.search}
            onChange={props.onSearch}
            placeholder="Search tasks…"
            className="flex-1"
          />
          <MobileFiltersSheet
            activeCount={activeFilterCount}
            onClear={clearFilters}
            className="shrink-0"
          >
            <FilterField label="Priority">
              <MultiSelectFilter
                label="Priority"
                options={TASK_PRIORITIES.map((p) => ({
                  value: p,
                  label: TASK_PRIORITY_LABELS[p],
                }))}
                selected={props.priority}
                onChange={(v) => props.onPriority(v as TaskPriority[])}
                className="w-full"
              />
            </FilterField>
            <FilterField label="Status">
              <MultiSelectFilter
                label="Status"
                options={TASK_STATUSES.map((s) => ({
                  value: s,
                  label: TASK_STATUS_LABELS[s],
                }))}
                selected={props.status}
                onChange={(v) => props.onStatus(v as TaskStatus[])}
                className="w-full"
              />
            </FilterField>
            {props.versions.length > 0 && (
              <FilterField label="Version">
                <MultiSelectFilter
                  label="Version"
                  options={props.versions.map((ver) => ({ value: ver, label: `v${ver}` }))}
                  selected={props.versionFilter}
                  onChange={props.onVersion}
                  className="w-full"
                />
              </FilterField>
            )}
            {props.projects.length > 0 && (
              <FilterField label="Project">
                <MultiSelectFilter
                  label="Project"
                  options={props.projects.map((p) => ({ value: p.id, label: p.name }))}
                  selected={props.projectFilter}
                  onChange={props.onProject}
                  className="w-full"
                />
              </FilterField>
            )}
            {props.showDepartment && props.departments.length > 0 && (
              <FilterField label="Department">
                <Select
                  value={props.departmentFilter}
                  onValueChange={(v) => props.onDepartment(v ?? "all")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {props.departments.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            )}
            {props.dateBasis && (
              <FilterField label="Date basis">
                <DateBasisToggle
                  value={props.dateBasis.value}
                  onChange={props.dateBasis.onChange}
                  options={[
                    { value: "dueDate", label: "Due date", Icon: CalendarClock },
                    {
                      value: "createdAt",
                      label: "Created date",
                      Icon: CalendarPlus,
                    },
                  ]}
                />
              </FilterField>
            )}
            <FilterField label="Date range">
              <DateRangeFilter
                value={props.dateRange}
                onChange={props.onDateRange}
                presets={props.datePresets}
                className="w-full"
              />
            </FilterField>
          </MobileFiltersSheet>
        </div>
        <MobileFilterChips chips={filterChips} />
      </div>
    </div>
  );
}

/** Labelled control wrapper used inside the mobile Filters sheet. */
function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
