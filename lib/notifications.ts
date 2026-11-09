// Server-only: creates notifications with the service-role client (employees cannot insert them from the browser).
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export const notificationTypes = [
  'task_assigned',
  'task_support',
  'task_blocked',
  'task_completed',
  'task_comment',
  'leave_pending',
  'leave_approved',
  'leave_rejected',
] as const

export type NotificationType = (typeof notificationTypes)[number]

export type NotificationInput = {
  type: NotificationType
  title: string
  body?: string
  link: string
  actorId: string | null
  recipientIds: (string | null | undefined)[]
}

export type NotificationRow = {
  user_id: string
  type: NotificationType
  title: string
  body: string
  link: string
  actor_id: string | null
}

/** One row per distinct recipient; the actor and empty ids are dropped. */
export function buildNotifications(input: NotificationInput): NotificationRow[] {
  const recipients = new Set<string>()
  for (const id of input.recipientIds) {
    if (id && id !== input.actorId) recipients.add(id)
  }
  return [...recipients].map((user_id) => ({
    user_id,
    type: input.type,
    title: input.title,
    body: input.body ?? '',
    link: input.link,
    actor_id: input.actorId,
  }))
}

export type NotificationClient = {
  from(table: string): { insert(rows: unknown[]): PromiseLike<{ error: { message: string } | null }> }
}

/** Saves notifications. Never throws: a failure here must not break the action that caused it. */
export async function notify(
  inputs: NotificationInput | NotificationInput[],
  client: NotificationClient = createAdminSupabaseClient() as unknown as NotificationClient
): Promise<void> {
  try {
    const rows = (Array.isArray(inputs) ? inputs : [inputs]).flatMap(buildNotifications)
    if (rows.length === 0) return
    const { error } = await client.from('notifications').insert(rows)
    if (error) console.error('[notifications] failed to save', error.message)
  } catch (err) {
    console.error('[notifications] failed to save', err)
  }
}

/** Only relative paths are followed; anything else goes to the inbox. */
export function safeLink(link: string): string {
  return link.startsWith('/') && !link.startsWith('//') ? link : '/notifications'
}
