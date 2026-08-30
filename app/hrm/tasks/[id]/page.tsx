import { notFound } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { updateTask } from './actions'

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

  return (
    <div className="max-w-2xl space-y-6">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <form action={updateTask} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <input type="hidden" name="taskId" value={task.id} />
        <input
          name="title"
          defaultValue={task.title}
          required
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-lg font-semibold focus:border-slate-800 focus:outline-none"
        />
        <textarea
          name="description"
          defaultValue={task.description}
          placeholder="Description"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
        />
        <div className="grid grid-cols-2 gap-3">
          <select
            name="status"
            defaultValue={task.status}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>
          <select
            name="priority"
            defaultValue={task.priority}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <select
            name="assigneeId"
            defaultValue={task.assignee_id ?? ''}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            <option value="">Unassigned</option>
            {allEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
          <input
            name="dueDate"
            type="date"
            defaultValue={task.due_date ?? ''}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Save
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-800">Activity</h2>
        <ul className="mt-3 space-y-2">
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
      </div>
    </div>
  )
}
