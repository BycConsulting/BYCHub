// Server-only: reads the signed-in user's own notifications (RLS limits rows to them).
import { createClient } from '@/lib/supabase/server'

export async function getUnreadCount(): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
  return count ?? 0
}
