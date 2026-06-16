import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import { KanbanCardView } from "./KanbanCard";
import { KanbanColumn } from "./KanbanColumn";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type Task,
  type TaskStatus,
} from "../../types/task";

interface KanbanBoardProps {
  tasks: Task[];
  getAssigneeName: (id: string) => string;
  getProjectName: (id: string) => string;
  canMove: boolean;
  onMoveTask: (taskId: string, status: TaskStatus) => void;
}

function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

export function KanbanBoard({
  tasks,
  getAssigneeName,
  getProjectName,
  canMove,
  onMoveTask,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Require a small drag distance so taps/clicks don't start a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const activeTask = activeId
    ? (tasks.find((t) => t.id === activeId) ?? null)
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const moved = tasks.find((t) => t.id === active.id);
    if (!moved) return;

    // The drop target is either a column (status id) or another card.
    const overId = String(over.id);
    const overStatus = over.data.current?.status as TaskStatus | undefined;
    const target: TaskStatus | null = isTaskStatus(overId)
      ? overId
      : (tasks.find((t) => t.id === overId)?.status ?? overStatus ?? null);

    if (target && target !== moved.status) {
      onMoveTask(moved.id, target);
    }
  }

  const columns = TASK_STATUSES.map((status) => ({
    status,
    title: TASK_STATUS_LABELS[status],
    tasks: tasks.filter((t) => t.status === status),
  }));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {columns.map((col) => (
          <KanbanColumn
            key={col.status}
            status={col.status}
            title={col.title}
            tasks={col.tasks}
            getAssigneeName={getAssigneeName}
            getProjectName={getProjectName}
            canMove={canMove}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <KanbanCardView
            task={activeTask}
            assigneeName={getAssigneeName(activeTask.assigneeId)}
            projectName={getProjectName(activeTask.projectId)}
            canMove
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
