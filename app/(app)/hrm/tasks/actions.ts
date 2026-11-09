'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createProjectSchema, parseTaskForm, updateTaskStatusSchema } from '@/lib/validation'
import { logTaskEvent } from '@/lib/task-events'
import { notify } from '@/lib/notifications'
import { taskAssignmentNotices, taskStatusNotices } from '@/lib/notification-events'
import { checkProjectMatchesClient, taskColumns } from '@/lib/task-form-data'
import type { TaskStatus } from '@/types/database'

export async function createTask(formData: FormData) {
  const user = await requireModule('tasks')

  const parsed = parseTaskForm(formData)

  if (!parsed.success) {
    redirect('/hrm/tasks?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const supabase = await createClient()

  const projectError = await checkProjectMatchesClient(supabase, parsed.data.projectId, parsed.data.clientId)
  if (projectError) {
    redirect('/hrm/tasks?error=' + encodeURIComponent(projectError))
  }

  const { data: created, error } = await supabase
    .from('tasks')
    .insert({ ...taskColumns(parsed.data), status: 'started', created_by: user.id })
    .select('id')
    .single()

  if (error || !created) {
    redirect('/hrm/tasks?error=' + encodeURIComponent(error?.message ?? 'Failed to create task'))
  }

  const { error: eventError } = await logTaskEvent(supabase, created.id, 'created', null, 'started', user.id)

  if (eventError) {
    redirect('/hrm/tasks?error=' + encodeURIComponent(eventError.message))
  }

  await notify(
    taskAssignmentNotices({
      taskId: created.id,
      title: parsed.data.title,
      actorId: user.id,
      previousOwnerId: null,
      ownerId: parsed.data.assigneeId,
      previousSupportIds: [],
      supportIds: parsed.data.noSupport ? [] : parsed.data.supportIds,
    })
  )

  revalidatePath('/hrm/tasks')
  redirect('/hrm/tasks')
}

export async function createProject(formData: FormData) {
  const user = await requireModule('tasks')

  const parsed = createProjectSchema.safeParse({
    name: formData.get('name'),
    clientId: formData.get('clientId') ?? '',
  })

  if (!parsed.success) {
    redirect('/hrm/tasks?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('projects')
    .insert({ name: parsed.data.name, client_id: parsed.data.clientId || null, created_by: user.id })

  if (error) {
    redirect('/hrm/tasks?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/hrm/tasks')
  redirect('/hrm/tasks')
}

/**
 * Board drag-and-drop. `note` carries the blocker reason when moving to
 * Blocked, or the final hand-off comment when moving to Completed.
 */
export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  note?: string
): Promise<{ error: string | null }> {
  const user = await requireModule('tasks')

  const parsed = updateTaskStatusSchema.safeParse({ taskId, status, note })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { data: current, error: currentError } = await supabase
    .from('tasks')
    .select('status, title, assignee_id, created_by')
    .eq('id', parsed.data.taskId)
    .single()

  if (currentError && currentError.code !== 'PGRST116') {
    return { error: currentError.message }
  }

  if (!current) {
    return { error: 'Task not found' }
  }

  const previousStatus = current.status
  const newStatus = parsed.data.status
  const noteText = parsed.data.note ?? ''

  if (newStatus === 'blocked' && !noteText) {
    return { error: 'Say what is pending and who needs to act' }
  }

  if (newStatus === 'done' && previousStatus !== 'done') {
    const { count } = await supabase
      .from('task_comments')
      .select('id', { count: 'exact', head: true })
      .eq('task_id', parsed.data.taskId)
      .eq('is_final', true)
    if (!noteText && !count) {
      return { error: 'A final hand-off comment (output links, summary) is required to complete a task' }
    }
  }

  const { data: updated, error } = await supabase
    .from('tasks')
    .update({
      status: newStatus,
      blocker_reason: newStatus === 'blocked' ? noteText : '',
      completed_at: newStatus === 'done' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.taskId)
    .select('id')
    .single()

  if (!updated) {
    return { error: !error || error.code === 'PGRST116' ? 'Task not found' : error.message }
  }

  // The status update above already committed and stands regardless of the
  // comment / audit-log writes' outcome — a failure here must not tell the
  // caller the move failed (task-board.tsx rolls the card back on any
  // {error}), which would desync the UI from a DB write that succeeded.
  if (newStatus === 'done' && noteText && previousStatus !== 'done') {
    const { error: commentError } = await supabase
      .from('task_comments')
      .insert({ task_id: parsed.data.taskId, body: noteText, is_final: true, created_by: user.id })
    if (commentError) console.error('[tasks] failed to save final comment', commentError)
  }

  if (previousStatus !== newStatus) {
    const { error: eventError } = await logTaskEvent(
      supabase,
      parsed.data.taskId,
      'status',
      previousStatus,
      newStatus,
      user.id
    )

    if (eventError) {
      console.error('[tasks] failed to log status change event', eventError)
    }
  }

  await notify(
    taskStatusNotices({
      taskId: parsed.data.taskId,
      title: current.title,
      actorId: user.id,
      previousStatus,
      status: newStatus,
      ownerId: current.assignee_id,
      creatorId: current.created_by,
    })
  )

  revalidatePath('/hrm/tasks')
  return { error: null }
}
