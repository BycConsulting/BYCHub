import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createTask, updateTaskStatus } from './actions'
import { TaskBoard } from './task-board'
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

  const { data: employees } = await supabase.from('users').select('id, name').eq('is_active', true).order('name')

  let query = supabase
    .from('tasks')
    .select('id, title, priority, status, assignee_id, due_date')
    .order('created_at', { ascending: true })

  if (assignee === 'me') {
    query = query.eq('assignee_id', user.id)
  } else if (assignee) {
    query = query.eq('assignee_id', assignee)
  }

  const { data: tasks } = await query

  const allTasks = tasks ?? []
  const allEmployees = employees ?? []
  const employeeNames = Object.fromEntries(allEmployees.map((employee) => [employee.id, employee.name]))

  const assigneeFilterOptions = [
    { value: '', label: 'All tasks' },
    { value: 'me', label: 'My tasks' },
    ...allEmployees.map((employee) => ({ value: employee.id, label: employee.name })),
  ]

  const assigneeOptions = [
    { value: '', label: 'Unassigned' },
    ...allEmployees.map((employee) => ({ value: employee.id, label: employee.name })),
  ]

  const priorityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' },
  ]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
          )}

          <form className="flex items-center gap-2">
            <FormSelect name="assignee" options={assigneeFilterOptions} defaultValue={assignee ?? ''} />
            <Button type="submit" variant="outline">
              Filter
            </Button>
          </form>

          <form action={createTask} className="mt-4 grid grid-cols-5 gap-2">
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium text-slate-500">Title</label>
              <Input name="title" placeholder="Task title" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Assignee</label>
              <FormSelect name="assigneeId" options={assigneeOptions} defaultValue="" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Priority</label>
              <FormSelect name="priority" options={priorityOptions} defaultValue="medium" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Due date</label>
              <Input name="dueDate" type="date" />
            </div>
            <Button type="submit" className="col-span-5">
              New task
            </Button>
          </form>
        </CardContent>
      </Card>

      <TaskBoard tasks={allTasks} employeeNames={employeeNames} updateTaskStatus={updateTaskStatus} />
    </div>
  )
}
