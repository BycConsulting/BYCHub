'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { addTaskCommentSchema, parseTaskForm } from '@/lib/validation'
import { logTaskEvent } from '@/lib/task-events'
import { notify } from '@/lib/notifications'
import { taskAssignmentNotices, taskCommentNotices, taskStatusNotices } from '@/lib/notification-events'
import { checkProjectMatchesClient, taskColumns } from '@/lib/task-form-data'

export async function updateTask(formData: FormData) {
  const user = await requireModule('tasks')

  const rawTaskId = String(formData.get('taskId') ?? '')
  const back = `/hrm/tasks/${rawTaskId}`

  const parsed = parseTaskForm(formData)

  if (!parsed.success) {
    redirect(back + '?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const fields = parsed.data
  const taskId = rawTaskId
  const finalComment = String(formData.get('finalComment') ?? '').trim()

  const supabase = await createClient()

  const { data: current, error: currentError } = await supabase
    .from('tasks')
    .select('status, priority, assignee_id, title, support_ids, created_by')
    .eq('id', taskId)
    .single()

  if (currentError && currentError.code !== 'PGRST116') {
    redirect(back + '?error=' + encodeURIComponent(currentError.message))
  }

  if (!current) {
    redirect(back + '?error=' + encodeURIComponent('Task not found'))
  }

  const projectError = await checkProjectMatchesClient(supabase, fields.projectId, fields.clientId)
  if (projectError) {
    redirect(back + '?error=' + encodeURIComponent(projectError))
  }

  if (fields.status === 'done' && current.status !== 'done') {
    const { count } = await supabase
      .from('task_comments')
      .select('id', { count: 'exact', head: true })
      .eq('task_id', taskId)
      .eq('is_final', true)
    if (!finalComment && !count) {
      redirect(
        back +
          '?error=' +
          encodeURIComponent('A final hand-off comment (output links, summary) is required to complete a task')
      )
    }
  }

  const { data: updated, error } = await supabase
    .from('tasks')
    .update({
      ...taskColumns(fields),
      status: fields.status,
      blocker_reason: fields.status === 'blocked' ? fields.blockerReason : '',
      completed_at:
        fields.status !== 'done' ? null : current.status === 'done' ? undefined : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Task not found' : error.message
    redirect(back + '?error=' + encodeURIComponent(message))
  }

  // The task update above already committed and stands regardless of these
  // comment / audit-log writes' outcome — a failure here must not redirect
  // with an error (which would falsely tell the user the save failed) or
  // abort logging the remaining field changes.
  if (fields.status === 'done' && finalComment) {
    const { error: commentError } = await supabase
      .from('task_comments')
      .insert({ task_id: taskId, body: finalComment, is_final: true, created_by: user.id })
    if (commentError) console.error('[tasks] failed to save final comment', commentError)
  }

  const changes: [('status' | 'priority' | 'assignee'), string | null, string | null][] = [
    ['status', current.status, fields.status],
    ['priority', current.priority, fields.priority],
    ['assignee', current.assignee_id, fields.assigneeId],
  ]
  for (const [field, from, to] of changes) {
    if (from === to) continue
    const { error: eventError } = await logTaskEvent(supabase, taskId, field, from, to, user.id)
    if (eventError) {
      console.error(`[tasks] failed to log ${field} change event`, eventError)
    }
  }

  await notify([
    ...taskAssignmentNotices({
      taskId,
      title: fields.title,
      actorId: user.id,
      previousOwnerId: current.assignee_id,
      ownerId: fields.assigneeId,
      previousSupportIds: current.support_ids,
      supportIds: fields.noSupport ? [] : fields.supportIds,
    }),
    ...taskStatusNotices({
      taskId,
      title: fields.title,
      actorId: user.id,
      previousStatus: current.status,
      status: fields.status,
      ownerId: fields.assigneeId,
      creatorId: current.created_by,
    }),
  ])

  revalidatePath(back)
  revalidatePath('/hrm/tasks')
  redirect(back)
}

export async function addTaskComment(formData: FormData) {
  const user = await requireModule('tasks')

  const rawTaskId = String(formData.get('taskId') ?? '')
  const back = `/hrm/tasks/${rawTaskId}`

  const parsed = addTaskCommentSchema.safeParse({ taskId: rawTaskId, body: formData.get('body') })

  if (!parsed.success) {
    redirect(back + '?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('task_comments')
    .insert({ task_id: parsed.data.taskId, body: parsed.data.body, created_by: user.id })

  if (error) {
    redirect(back + '?error=' + encodeURIComponent(error.message))
  }

  const { data: task } = await supabase
    .from('tasks')
    .select('title, assignee_id, created_by, support_ids')
    .eq('id', parsed.data.taskId)
    .single()

  if (task) {
    await notify(
      taskCommentNotices({
        taskId: parsed.data.taskId,
        title: task.title,
        actorId: user.id,
        ownerId: task.assignee_id,
        creatorId: task.created_by,
        supportIds: task.support_ids,
      })
    )
  }

  revalidatePath(back)
  redirect(back)
}
