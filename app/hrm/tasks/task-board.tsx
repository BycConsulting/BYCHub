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
}

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: 'To Do' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'done', label: 'Done' },
]

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

function TaskCard({ task, assigneeName }: { task: BoardTask; assigneeName: string }) {
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
      className="touch-none cursor-grab rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-[0_1px_2px_0_rgba(30,41,59,0.06),0_2px_6px_-1px_rgba(30,41,59,0.08)]"
    >
      <Link href={`/hrm/tasks/${task.id}`} className="font-medium text-slate-800 hover:underline">
        {task.title}
      </Link>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span className={`rounded-full px-2 py-0.5 ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
        <span>{assigneeName}</span>
      </div>
      {task.due_date && <div className="mt-1 text-xs text-slate-400">Due {task.due_date}</div>}
    </div>
  )
}

function Column({
  status,
  label,
  tasks,
  employeeNames,
}: {
  status: TaskStatus
  label: string
  tasks: BoardTask[]
  employeeNames: Record<string, string>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[200px] flex-1 rounded-xl border border-slate-200 p-3 ${
        isOver ? 'bg-slate-50' : 'bg-slate-100/50'
      }`}
    >
      <h2 className="mb-3 text-sm font-semibold text-slate-600">
        {label} <span className="text-slate-400">({tasks.length})</span>
      </h2>
      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            assigneeName={task.assignee_id ? (employeeNames[task.assignee_id] ?? 'Unknown') : 'Unassigned'}
          />
        ))}
      </div>
    </div>
  )
}

export function TaskBoard({
  tasks,
  employeeNames,
  updateTaskStatus,
}: {
  tasks: BoardTask[]
  employeeNames: Record<string, string>
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<{ error: string | null }>
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

    const previousStatus = task.status
    setLocalTasks((current) => current.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)))

    startTransition(() => {
      updateTaskStatus(taskId, newStatus).then((result) => {
        if (result.error) {
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
      <div className="flex gap-4">
        {COLUMNS.map((column) => (
          <Column
            key={column.status}
            status={column.status}
            label={column.label}
            tasks={localTasks.filter((task) => task.status === column.status)}
            employeeNames={employeeNames}
          />
        ))}
      </div>
    </DndContext>
  )
}
