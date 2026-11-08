'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarDays, Clock, Link2 } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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

const COLUMNS: { status: TaskStatus; label: string; dot: string }[] = [
  { status: 'started', label: 'Started', dot: 'bg-muted-foreground' },
  { status: 'in_progress', label: 'In Progress', dot: 'bg-primary' },
  { status: 'blocked', label: 'Blocked / Waiting', dot: 'bg-warning' },
  { status: 'done', label: 'Completed', dot: 'bg-success' },
]

const PRIORITY_STYLES: Record<TaskPriority, { dot: string; label: string }> = {
  low: { dot: 'bg-muted-foreground', label: 'Low' },
  medium: { dot: 'bg-primary', label: 'Medium' },
  high: { dot: 'bg-warning', label: 'High' },
  urgent: { dot: 'bg-destructive', label: 'Urgent' },
}

function initialsFor(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function TaskCard({ task, assigneeName, today }: { task: BoardTask; assigneeName: string; today: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.6 : 1 }
    : undefined

  const overdue = task.status !== 'done' && !!task.due_date && task.due_date < today
  const priority = PRIORITY_STYLES[task.priority]

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="touch-none cursor-grab space-y-3 rounded-xl border border-border bg-card p-3.5 text-sm shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="truncate font-medium">{task.clientName}</span>
        {task.projectName && <span className="truncate">· {task.projectName}</span>}
      </div>

      <Link href={`/hrm/tasks/${task.id}`} className="block font-medium leading-snug text-foreground hover:underline">
        {task.title}
      </Link>

      {task.status === 'blocked' && task.blocker_reason && (
        <div className="flex items-start gap-1.5 rounded-lg bg-warning/15 px-2 py-1.5 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span>{task.blocker_reason}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground/80">
          <span className={`h-1.5 w-1.5 rounded-full ${priority.dot}`} />
          {priority.label}
        </span>
        {task.due_date && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
              overdue ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground/80'
            }`}
          >
            {overdue ? <Clock className="h-3 w-3" /> : <CalendarDays className="h-3 w-3" />}
            {task.due_date}
          </span>
        )}
        {task.status !== 'done' && task.openDependencies > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 font-medium text-foreground">
            <Link2 className="h-3 w-3" />
            {task.openDependencies}
          </span>
        )}
        <span
          title={assigneeName}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[0.65rem] font-semibold text-primary"
        >
          {task.assignee_id ? initialsFor(assigneeName) : '?'}
        </span>
      </div>
    </div>
  )
}

function Column({
  status,
  label,
  dot,
  tasks,
  employeeNames,
  today,
}: {
  status: TaskStatus
  label: string
  dot: string
  tasks: BoardTask[]
  employeeNames: Record<string, string>
  today: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[220px] rounded-2xl border p-3 transition-colors ${
        isOver ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/50'
      }`}
    >
      <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold text-foreground">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
        <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground shadow-sm">
          {tasks.length}
        </span>
      </h2>
      <div className="space-y-2.5">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            assigneeName={task.assignee_id ? (employeeNames[task.assignee_id] ?? 'Unknown') : 'Unassigned'}
            today={today}
          />
        ))}
        {tasks.length === 0 && (
          <p className="rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
            Drop a task here
          </p>
        )}
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
  // A move to Blocked / Completed waits here for its reason / hand-off note.
  const [pending, setPending] = useState<{ taskId: string; status: TaskStatus } | null>(null)
  const [note, setNote] = useState('')
  const [moveError, setMoveError] = useState<string | null>(null)

  function commitMove(taskId: string, newStatus: TaskStatus, noteText?: string) {
    const task = localTasks.find((t) => t.id === taskId)
    if (!task) return
    const previousStatus = task.status
    setLocalTasks((current) => current.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)))

    startTransition(() => {
      updateTaskStatus(taskId, newStatus, noteText).then((result) => {
        if (result.error) {
          setMoveError(result.error)
          setLocalTasks((current) => current.map((t) => (t.id === taskId ? { ...t, status: previousStatus } : t)))
        }
      })
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const taskId = String(active.id)
    const newStatus = over.id as TaskStatus

    const task = localTasks.find((t) => t.id === taskId)
    if (!task || task.status === newStatus) return

    if (newStatus === 'blocked' || newStatus === 'done') {
      setNote('')
      setPending({ taskId, status: newStatus })
      return
    }
    commitMove(taskId, newStatus)
  }

  function confirmPending() {
    if (!pending || !note.trim()) return
    commitMove(pending.taskId, pending.status, note.trim())
    setPending(null)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  return (
    <>
      {moveError && (
        <p className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {moveError}
        </p>
      )}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((column) => (
            <Column
              key={column.status}
              status={column.status}
              label={column.label}
              dot={column.dot}
              tasks={localTasks.filter((task) => task.status === column.status)}
              employeeNames={employeeNames}
              today={today}
            />
          ))}
        </div>
      </DndContext>

      <Dialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg">
              {pending?.status === 'blocked' ? 'What is blocking this task?' : 'Final hand-off'}
            </DialogTitle>
            <DialogDescription>
              {pending?.status === 'blocked'
                ? 'Say what is pending and who needs to act.'
                : 'Add a summary and links to the final output to complete this task.'}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={pending?.status === 'blocked' ? 'Waiting for client approval from…' : 'Delivered: summary, links…'}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button onClick={confirmPending} disabled={!note.trim()}>
              {pending?.status === 'blocked' ? 'Mark blocked' : 'Complete task'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
