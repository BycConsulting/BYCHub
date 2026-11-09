'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { notificationIdSchema } from '@/lib/validation'
import { safeLink } from '@/lib/notifications'

/** Marks one of your notifications read and goes to the page it is about. */
export async function openNotification(formData: FormData) {
  const user = await requireUser()

  const parsed = notificationIdSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) redirect('/notifications')

  const supabase = await createClient()

  const { data: notification } = await supabase
    .from('notifications')
    .select('link')
    .eq('id', parsed.data.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (notification) {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', parsed.data.id)
      .eq('user_id', user.id)
      .is('read_at', null)
  }

  revalidatePath('/', 'layout')
  redirect(safeLink(notification?.link ?? ''))
}

export async function markAllRead() {
  const user = await requireUser()
  const supabase = await createClient()

  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)

  revalidatePath('/', 'layout')
  redirect('/notifications')
}
