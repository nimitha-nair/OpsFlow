import { useState } from "react";
import {
  CalendarDays,
  GanttChart,
  Search,
  SlidersHorizontal,
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
import type { DateRange, DateRangePreset } from "../../lib/date-range";
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
  versionFilter: string;
  onVersion: (v: string) => void;

  projects: { id: string; name: string }[];
  projectFilter: string;
  onProject: (v: string) => void;

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
  const [filtersOpen, setFiltersOpen] = useState(false);
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

      {/* Filter row — search always visible; the rest collapses on mobile. */}
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
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
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted md:hidden"
          >
            <SlidersHorizontal className="size-4" />
            Filters
          </button>
        </div>

        <div
          className={cn(
            "flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center md:flex",
            filtersOpen ? "flex" : "hidden",
          )}
        >
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
          <Select
            value={props.versionFilter}
            onValueChange={(v) => props.onVersion(v ?? "all")}
          >
            <SelectTrigger size="sm" className="w-full sm:w-36">
              <SelectValue placeholder="Version" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All versions</SelectItem>
              {props.versions.map((ver) => (
                <SelectItem key={ver} value={ver}>
                  v{ver}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {props.projects.length > 0 && (
          <Select value={props.projectFilter} onValueChange={(v) => props.onProject(v ?? "all")}>
            <SelectTrigger size="sm" className="w-full sm:w-44">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {props.projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
    </div>
  );
}
