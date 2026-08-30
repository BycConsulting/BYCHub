import { createClient } from '@/lib/supabase/server'

export function logTaskEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
  field: 'created' | 'status' | 'assignee' | 'priority',
  fromValue: string | null,
  toValue: string | null,
  changedBy: string
) {
  return supabase.from('task_events').insert({
    task_id: taskId,
    field,
    from_value: fromValue,
    to_value: toValue,
    changed_by: changedBy,
  })
}
