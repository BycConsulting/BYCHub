import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createTask, updateTaskStatus } from './actions'
import { TaskBoard } from './task-board'

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

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800">Tasks</h1>
        {error && (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
        )}

        <form className="mt-3 flex items-center gap-2">
          <select
            name="assignee"
            defaultValue={assignee ?? ''}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            <option value="">All tasks</option>
            <option value="me">My tasks</option>
            {allEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Filter
          </button>
        </form>

        <form action={createTask} className="mt-4 grid grid-cols-5 gap-2">
          <input
            name="title"
            placeholder="Task title"
            required
            className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <select
            name="assigneeId"
            defaultValue=""
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            <option value="">Unassigned</option>
            {allEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
          <select
            name="priority"
            defaultValue="medium"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <input
            name="dueDate"
            type="date"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <button
            type="submit"
            className="col-span-5 rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            New task
          </button>
        </form>
      </div>

      <TaskBoard tasks={allTasks} employeeNames={employeeNames} updateTaskStatus={updateTaskStatus} />
    </div>
  )
}
