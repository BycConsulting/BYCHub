import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { loadTaskFormOptions, todayISO } from '@/lib/task-form-data'
import Link from 'next/link'
import { AlarmClock, CheckCircle2, ListTodo, PauseCircle } from 'lucide-react'
import { updateTaskStatus } from './actions'
import { TaskBoard } from './task-board'
import { NewProjectDialog, NewTaskDialog } from './new-task-dialog'
import { PageHeader } from '@/components/page-header'
import { StatTile } from '@/components/stat-tile'
import { Button } from '@/components/ui/button'
import { FormSelect } from '@/components/ui/form-select'

export default async function TasksBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; assignee?: string }>
}) {
  const user = await requireModule('tasks')
  const { error, assignee } = await searchParams
  const supabase = await createClient()

  const { clients, projects, employees, taskRefs } = await loadTaskFormOptions(supabase)

  let query = supabase
    .from('tasks')
    .select('id, title, priority, status, assignee_id, due_date, client_id, project_id, blocker_reason, dependency_task_ids, completed_at')
    .order('created_at', { ascending: true })

  if (assignee === 'me') {
    query = query.eq('assignee_id', user.id)
  } else if (assignee) {
    query = query.eq('assignee_id', assignee)
  }

  const { data: tasks } = await query

  const employeeNames = Object.fromEntries(employees.map((employee) => [employee.id, employee.name]))
  const clientNames = Object.fromEntries(clients.map((c) => [c.id, c.name]))
  const projectNames = Object.fromEntries(projects.map((p) => [p.id, p.name]))
  const doneIds = new Set(taskRefs.filter((t) => t.status === 'done').map((t) => t.id))
  const today = todayISO()

  const boardTasks = (tasks ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    status: t.status,
    assignee_id: t.assignee_id,
    due_date: t.due_date,
    blocker_reason: t.blocker_reason,
    clientName: t.client_id ? (clientNames[t.client_id] ?? 'Unknown') : 'BYC',
    projectName: t.project_id ? (projectNames[t.project_id] ?? '') : '',
    openDependencies: t.dependency_task_ids.filter((id) => !doneIds.has(id)).length,
  }))

  const assigneeFilterOptions = [
    { value: '', label: 'Everyone' },
    ...employees.map((employee) => ({ value: employee.id, label: employee.name })),
  ]

  const open = boardTasks.filter((t) => t.status !== 'done')
  const overdue = open.filter((t) => t.due_date && t.due_date < today).length
  const weekAgo = new Date(new Date(`${today}T00:00:00`).getTime() - 7 * 24 * 3600 * 1000).toISOString()
  const doneThisWeek = (tasks ?? []).filter((t) => t.status === 'done' && (t.completed_at ?? '') >= weekAgo).length

  const pill = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground/70 hover:bg-muted'
    }`

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="Plan, assign and track work across clients and internal projects."
        actions={
          <>
            <NewProjectDialog clients={clients} />
            <NewTaskDialog
              startOpen={!!error}
              defaults={{
                clientId: '',
                projectId: '',
                title: '',
                description: '',
                expectedOutput: '',
                assigneeId: user.id,
                supportIds: [],
                noSupport: false,
                priority: 'medium',
                estimatedHours: '',
                dependencyTaskIds: [],
                dependencyNote: '',
                noDependencies: false,
                startDate: today,
                endDate: '',
                status: 'started',
                blockerReason: '',
              }}
              clients={clients}
              projects={projects}
              employees={employees}
              taskRefs={taskRefs}
            />
          </>
        }
      />

      {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Open tasks" value={open.length} icon={ListTodo} />
        <StatTile
          label="Blocked / waiting"
          value={open.filter((t) => t.status === 'blocked').length}
          icon={PauseCircle}
          tone="warning"
        />
        <StatTile label="Overdue" value={overdue} icon={AlarmClock} tone="danger" />
        <StatTile label="Completed this week" value={doneThisWeek} icon={CheckCircle2} tone="success" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full border border-border bg-card p-1 shadow-sm">
          <Link href="/hrm/tasks" className={pill(!assignee)}>
            All tasks
          </Link>
          <Link href="/hrm/tasks?assignee=me" className={pill(assignee === 'me')}>
            My tasks
          </Link>
        </div>
        <form className="flex items-center gap-2">
          <FormSelect
            name="assignee"
            options={assigneeFilterOptions}
            defaultValue={assignee && assignee !== 'me' ? assignee : ''}
            className="w-44"
          />
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </form>
      </div>

      <TaskBoard tasks={boardTasks} employeeNames={employeeNames} today={today} updateTaskStatus={updateTaskStatus} />
    </div>
  )
}
