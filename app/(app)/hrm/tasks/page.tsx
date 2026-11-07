import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { loadTaskFormOptions, todayISO } from '@/lib/task-form-data'
import { createProject, createTask, updateTaskStatus } from './actions'
import { TaskBoard } from './task-board'
import { TaskFields } from './task-fields'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
    .select('id, title, priority, status, assignee_id, due_date, client_id, project_id, blocker_reason, dependency_task_ids')
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
    { value: '', label: 'All tasks' },
    { value: 'me', label: 'My tasks' },
    ...employees.map((employee) => ({ value: employee.id, label: employee.name })),
  ]

  const clientOptions = [{ value: '', label: 'BYC (internal)' }, ...clients.map((c) => ({ value: c.id, label: c.name }))]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tasks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}

          <form className="flex items-center gap-2">
            <FormSelect name="assignee" options={assigneeFilterOptions} defaultValue={assignee ?? ''} />
            <Button type="submit" variant="outline">
              Filter
            </Button>
          </form>

          <details className="rounded-lg border border-border p-3" open={!!error}>
            <summary className="cursor-pointer text-sm font-medium text-foreground/75">New task</summary>
            <form action={createTask} className="mt-3 space-y-3">
              <TaskFields
                values={{
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
                showStatus={false}
              />
              <p className="text-xs text-muted-foreground">
                Auto-filled: you as owner, today as start date, status Started. Created-by and created-at are recorded
                automatically.
              </p>
              <Button type="submit">Create task</Button>
            </form>
          </details>

          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium text-foreground/75">New project</summary>
            <form action={createProject} className="mt-3 grid grid-cols-3 gap-2">
              <Input name="name" placeholder="Project name, e.g. KLR Website" required className="col-span-1" />
              <FormSelect name="clientId" options={clientOptions} defaultValue="" />
              <Button type="submit" variant="outline">
                Add project
              </Button>
            </form>
          </details>
        </CardContent>
      </Card>

      <TaskBoard tasks={boardTasks} employeeNames={employeeNames} today={today} updateTaskStatus={updateTaskStatus} />
    </div>
  )
}
