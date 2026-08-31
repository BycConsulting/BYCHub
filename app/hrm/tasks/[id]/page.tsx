import { notFound } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { updateTask } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormSelect } from '@/components/ui/form-select'

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('tasks')
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id, title, description, status, priority, assignee_id, due_date')
    .eq('id', id)
    .single()

  if (taskError && taskError.code !== 'PGRST116') {
    throw new Error(taskError.message)
  }

  if (!task) notFound()

  const { data: employees } = await supabase.from('users').select('id, name').eq('is_active', true).order('name')

  const allEmployees = employees ?? []
  const employeeById = new Map(allEmployees.map((employee) => [employee.id, employee.name]))

  const { data: events } = await supabase
    .from('task_events')
    .select('id, field, from_value, to_value, changed_by, created_at')
    .eq('task_id', id)
    .order('created_at', { ascending: false })

  function describeValue(field: string, value: string | null): string {
    if (value === null) return field === 'assignee' ? 'Unassigned' : '—'
    if (field === 'assignee') return employeeById.get(value) ?? 'Unknown'
    return value
  }

  const statusOptions = [
    { value: 'todo', label: 'To Do' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'done', label: 'Done' },
  ]

  const priorityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' },
  ]

  const assigneeOptions = [
    { value: '', label: 'Unassigned' },
    ...allEmployees.map((employee) => ({ value: employee.id, label: employee.name })),
  ]

  return (
    <div className="max-w-2xl space-y-6">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <Card>
        <CardContent>
          <form action={updateTask} className="space-y-3">
            <input type="hidden" name="taskId" value={task.id} />
            <Input name="title" defaultValue={task.title} required className="text-lg font-semibold" />
            <Textarea
              name="description"
              defaultValue={task.description}
              placeholder="Description"
              className="w-full"
            />
            <div className="grid grid-cols-2 gap-3">
              <FormSelect name="status" options={statusOptions} defaultValue={task.status} />
              <FormSelect name="priority" options={priorityOptions} defaultValue={task.priority} />
              <FormSelect name="assigneeId" options={assigneeOptions} defaultValue={task.assignee_id ?? ''} />
              <Input name="dueDate" type="date" defaultValue={task.due_date ?? ''} />
            </div>
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {(events ?? []).map((event) => (
              <li key={event.id} className="text-sm text-slate-600">
                {event.field === 'created' ? (
                  <span>Task created</span>
                ) : (
                  <span>
                    {event.field} changed from {describeValue(event.field, event.from_value)} to{' '}
                    {describeValue(event.field, event.to_value)}
                  </span>
                )}
                <div className="text-xs text-slate-400">
                  {employeeById.get(event.changed_by ?? '') ?? 'Unknown'} — {new Date(event.created_at).toLocaleString()}
                </div>
              </li>
            ))}
            {(events ?? []).length === 0 && <li className="text-sm text-slate-400">No activity yet.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
