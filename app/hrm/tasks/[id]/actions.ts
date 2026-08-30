'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { updateTaskSchema } from '@/lib/validation'
import { logTaskEvent } from '@/lib/task-events'

export async function updateTask(formData: FormData) {
  const user = await requireModule('tasks')

  const rawTaskId = formData.get('taskId')

  const parsed = updateTaskSchema.safeParse({
    taskId: rawTaskId,
    title: formData.get('title'),
    description: formData.get('description'),
    status: formData.get('status'),
    priority: formData.get('priority'),
    assigneeId: formData.get('assigneeId'),
    dueDate: formData.get('dueDate'),
  })

  if (!parsed.success) {
    redirect(`/hrm/tasks/${rawTaskId}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const { taskId, title, description, status, priority, assigneeId, dueDate } = parsed.data

  const supabase = await createClient()

  const { data: current, error: currentError } = await supabase
    .from('tasks')
    .select('status, priority, assignee_id')
    .eq('id', taskId)
    .single()

  if (currentError && currentError.code !== 'PGRST116') {
    redirect(`/hrm/tasks/${taskId}?error=` + encodeURIComponent(currentError.message))
  }

  if (!current) {
    redirect(`/hrm/tasks/${taskId}?error=` + encodeURIComponent('Task not found'))
  }

  const newAssigneeId = assigneeId || null

  const { data: updated, error } = await supabase
    .from('tasks')
    .update({
      title,
      description: description || '',
      status,
      priority,
      assignee_id: newAssigneeId,
      due_date: dueDate || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Task not found' : error.message
    redirect(`/hrm/tasks/${taskId}?error=` + encodeURIComponent(message))
  }

  if (current.status !== status) {
    const { error: eventError } = await logTaskEvent(supabase, taskId, 'status', current.status, status, user.id)
    if (eventError) {
      redirect(`/hrm/tasks/${taskId}?error=` + encodeURIComponent(eventError.message))
    }
  }

  if (current.priority !== priority) {
    const { error: eventError } = await logTaskEvent(
      supabase,
      taskId,
      'priority',
      current.priority,
      priority,
      user.id
    )
    if (eventError) {
      redirect(`/hrm/tasks/${taskId}?error=` + encodeURIComponent(eventError.message))
    }
  }

  if (current.assignee_id !== newAssigneeId) {
    const { error: eventError } = await logTaskEvent(
      supabase,
      taskId,
      'assignee',
      current.assignee_id,
      newAssigneeId,
      user.id
    )
    if (eventError) {
      redirect(`/hrm/tasks/${taskId}?error=` + encodeURIComponent(eventError.message))
    }
  }

  revalidatePath(`/hrm/tasks/${taskId}`)
  revalidatePath('/hrm/tasks')
  redirect(`/hrm/tasks/${taskId}`)
}
