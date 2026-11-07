'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  DndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  type DragEndEvent,
} from '@dnd-kit/core'
import type { TaskPriority, TaskStatus } from '@/types/database'

interface BoardTask {
  id: string
  title: string
  priority: TaskPriority
  status: TaskStatus
  assignee_id: string | null
  due_date: string | null
  blocker_reason: string
  clientName: string
  projectName: string
  openDependencies: number
}

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'started', label: 'Started' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'blocked', label: 'Blocked / Waiting' },
  { status: 'done', label: 'Completed' },
]

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'bg-muted text-foreground/75',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

function TaskCard({ task, assigneeName, today }: { task: BoardTask; assigneeName: string; today: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.5 : 1 }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="touch-none cursor-grab rounded-xl border border-border bg-card p-3.5 text-sm shadow-sm transition-shadow hover:shadow-md"
    >
      <Link href={`/hrm/tasks/${task.id}`} className="font-medium text-foreground hover:underline">
        {task.title}
      </Link>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className={`rounded-full px-2 py-0.5 ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
        <span>{assigneeName}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {task.clientName}
        {task.projectName && ` · ${task.projectName}`}
      </div>
      {task.due_date && (
        <div
          className={`mt-1 text-xs ${
            task.status !== 'done' && task.due_date < today ? 'font-medium text-red-600' : 'text-muted-foreground'
          }`}
        >
          Due {task.due_date}
          {task.status !== 'done' && task.due_date < today && ' · overdue'}
        </div>
      )}
      {task.status === 'blocked' && task.blocker_reason && (
        <div className="mt-1 text-xs text-amber-700">{task.blocker_reason}</div>
      )}
      {task.status !== 'done' && task.openDependencies > 0 && (
        <div className="mt-1 text-xs text-amber-700">Waiting on {task.openDependencies} task(s)</div>
      )}
    </div>
  )
}

function Column({
  status,
  label,
  tasks,
  employeeNames,
  today,
}: {
  status: TaskStatus
  label: string
  tasks: BoardTask[]
  employeeNames: Record<string, string>
  today: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[200px] flex-1 rounded-xl border border-border p-3 ${
        isOver ? 'bg-muted' : 'bg-muted/50'
      }`}
    >
      <h2 className="mb-3 text-sm font-semibold text-foreground/75">
        {label} <span className="text-muted-foreground">({tasks.length})</span>
      </h2>
      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            assigneeName={task.assignee_id ? (employeeNames[task.assignee_id] ?? 'Unknown') : 'Unassigned'}
            today={today}
          />
        ))}
      </div>
    </div>
  )
}

export function TaskBoard({
  tasks,
  employeeNames,
  today,
  updateTaskStatus,
}: {
  tasks: BoardTask[]
  employeeNames: Record<string, string>
  today: string
  updateTaskStatus: (taskId: string, status: TaskStatus, note?: string) => Promise<{ error: string | null }>
}) {
  const [localTasks, setLocalTasks] = useState(tasks)
  const [syncedTasks, setSyncedTasks] = useState(tasks)
  if (syncedTasks !== tasks) {
    setSyncedTasks(tasks)
    setLocalTasks(tasks)
  }
  const [, startTransition] = useTransition()

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const taskId = String(active.id)
    const newStatus = over.id as TaskStatus

    const task = localTasks.find((t) => t.id === taskId)
    if (!task || task.status === newStatus) return

    // Blocked needs a reason and Completed needs the final hand-off comment.
    let note: string | undefined
    if (newStatus === 'blocked') {
      note = window.prompt('What is pending, and who needs to act?')?.trim()
      if (!note) return
    } else if (newStatus === 'done') {
      note = window.prompt('Final hand-off: summary and output links')?.trim()
      if (!note) return
    }

    const previousStatus = task.status
    setLocalTasks((current) => current.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)))

    startTransition(() => {
      updateTaskStatus(taskId, newStatus, note).then((result) => {
        if (result.error) {
          window.alert(result.error)
          setLocalTasks((current) => current.map((t) => (t.id === taskId ? { ...t, status: previousStatus } : t)))
        }
      })
    })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((column) => (
          <Column
            key={column.status}
            status={column.status}
            label={column.label}
            tasks={localTasks.filter((task) => task.status === column.status)}
            employeeNames={employeeNames}
            today={today}
          />
        ))}
      </div>
    </DndContext>
  )
}
