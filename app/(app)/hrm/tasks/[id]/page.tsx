import { notFound } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { loadTaskFormOptions } from '@/lib/task-form-data'
import { addTaskComment, updateTask } from './actions'
import { TaskFields, TASK_STATUS_LABELS } from '../task-fields'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

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

  const { data: task, error: taskError } = await supabase.from('tasks').select('*').eq('id', id).single()

  if (taskError && taskError.code !== 'PGRST116') {
    throw new Error(taskError.message)
  }

  if (!task) notFound()

  const { clients, projects, employees, taskRefs } = await loadTaskFormOptions(supabase)
  const employeeById = new Map(employees.map((employee) => [employee.id, employee.name]))

  const [{ data: events }, { data: comments }] = await Promise.all([
    supabase
      .from('task_events')
      .select('id, field, from_value, to_value, changed_by, created_at')
      .eq('task_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('task_comments')
      .select('id, body, is_final, created_by, created_at')
      .eq('task_id', id)
      .order('created_at', { ascending: true }),
  ])

  const hasFinalComment = (comments ?? []).some((c) => c.is_final)

  function describeValue(field: string, value: string | null): string {
    if (value === null) return field === 'assignee' ? 'Unassigned' : '—'
    if (field === 'assignee') return employeeById.get(value) ?? 'Unknown'
    if (field === 'status') return TASK_STATUS_LABELS[value as keyof typeof TASK_STATUS_LABELS] ?? value
    return value
  }

  return (
    <div className="max-w-4xl space-y-6">
      {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent>
          <form action={updateTask} className="space-y-3">
            <input type="hidden" name="taskId" value={task.id} />
            <TaskFields
              values={{
                clientId: task.client_id ?? '',
                projectId: task.project_id ?? '',
                title: task.title,
                description: task.description,
                expectedOutput: task.expected_output,
                assigneeId: task.assignee_id ?? '',
                supportIds: task.support_ids,
                noSupport: task.no_support_needed,
                priority: task.priority,
                estimatedHours: task.estimated_hours?.toString() ?? '',
                dependencyTaskIds: task.dependency_task_ids,
                dependencyNote: task.dependency_note,
                noDependencies: task.dependency_task_ids.length === 0 && !task.dependency_note,
                startDate: task.start_date ?? '',
                endDate: task.due_date ?? '',
                status: task.status,
                blockerReason: task.blocker_reason,
              }}
              clients={clients}
              projects={projects}
              employees={employees}
              taskRefs={taskRefs.filter((t) => t.id !== task.id)}
              showStatus
            />
            {!hasFinalComment && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Final hand-off comment (required to set status to Completed)
                </label>
                <Textarea name="finalComment" placeholder="Summary and links to the final output" />
              </div>
            )}
            <Button type="submit">Save</Button>
            {task.completed_at && (
              <p className="text-xs text-muted-foreground">Completed {new Date(task.completed_at).toLocaleString()}</p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Comments / updates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {(comments ?? []).map((comment) => (
              <li key={comment.id} className="rounded-lg border border-border p-2 text-sm text-foreground/75">
                {comment.is_final && (
                  <span className="mr-2 rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">Final hand-off</span>
                )}
                <span className="whitespace-pre-wrap">{comment.body}</span>
                <div className="text-xs text-muted-foreground">
                  {employeeById.get(comment.created_by ?? '') ?? 'Unknown'} — {new Date(comment.created_at).toLocaleString()}
                </div>
              </li>
            ))}
            {(comments ?? []).length === 0 && <li className="text-sm text-muted-foreground">No updates yet.</li>}
          </ul>
          <form action={addTaskComment} className="space-y-2">
            <input type="hidden" name="taskId" value={task.id} />
            <Textarea name="body" placeholder="Progress, draft links, review feedback, approvals" required />
            <Button type="submit" variant="outline">
              Add update
            </Button>
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
              <li key={event.id} className="text-sm text-foreground/75">
                {event.field === 'created' ? (
                  <span>Task created</span>
                ) : (
                  <span>
                    {event.field} changed from {describeValue(event.field, event.from_value)} to{' '}
                    {describeValue(event.field, event.to_value)}
                  </span>
                )}
                <div className="text-xs text-muted-foreground">
                  {employeeById.get(event.changed_by ?? '') ?? 'Unknown'} — {new Date(event.created_at).toLocaleString()}
                </div>
              </li>
            ))}
            {(events ?? []).length === 0 && <li className="text-sm text-muted-foreground">No activity yet.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
