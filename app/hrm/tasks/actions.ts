'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createTaskSchema, updateTaskStatusSchema } from '@/lib/validation'
import { logTaskEvent } from '@/lib/task-events'
import type { TaskStatus } from '@/types/database'

export async function createTask(formData: FormData) {
  const user = await requireModule('tasks')

  const parsed = createTaskSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') ?? undefined,
    priority: formData.get('priority'),
    assigneeId: formData.get('assigneeId'),
    dueDate: formData.get('dueDate'),
  })

  if (!parsed.success) {
    redirect('/hrm/tasks?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const { title, description, priority, assigneeId, dueDate } = parsed.data

  const supabase = await createClient()
  const { data: created, error } = await supabase
    .from('tasks')
    .insert({
      title,
      description: description || '',
      priority,
      assignee_id: assigneeId || null,
      due_date: dueDate || null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !created) {
    redirect('/hrm/tasks?error=' + encodeURIComponent(error?.message ?? 'Failed to create task'))
  }

  const { error: eventError } = await logTaskEvent(supabase, created.id, 'created', null, 'todo', user.id)

  if (eventError) {
    redirect('/hrm/tasks?error=' + encodeURIComponent(eventError.message))
  }

  revalidatePath('/hrm/tasks')
  redirect('/hrm/tasks')
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<{ error: string | null }> {
  const user = await requireModule('tasks')

  const parsed = updateTaskStatusSchema.safeParse({ taskId, status })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { data: current, error: currentError } = await supabase
    .from('tasks')
    .select('status')
    .eq('id', parsed.data.taskId)
    .single()

  if (currentError && currentError.code !== 'PGRST116') {
    return { error: currentError.message }
  }

  if (!current) {
    return { error: 'Task not found' }
  }

  const previousStatus = current.status

  const { data: updated, error } = await supabase
    .from('tasks')
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.taskId)
    .select('id')
    .single()

  if (!updated) {
    return { error: !error || error.code === 'PGRST116' ? 'Task not found' : error.message }
  }

  if (previousStatus !== parsed.data.status) {
    // The status update above already committed and stands regardless of
    // this audit-log write's outcome — a failure here must not tell the
    // caller the move failed (task-board.tsx rolls the card back on any
    // {error}), which would desync the UI from a DB write that actually
    // succeeded. Log instead of returning it as a failure.
    const { error: eventError } = await logTaskEvent(
      supabase,
      parsed.data.taskId,
      'status',
      previousStatus,
      parsed.data.status,
      user.id
    )

    if (eventError) {
      console.error('[tasks] failed to log status change event', eventError)
    }
  }

  revalidatePath('/hrm/tasks')
  return { error: null }
}
