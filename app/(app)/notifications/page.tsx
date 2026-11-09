import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { currentTime, relativeTime } from '@/lib/relative-time'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { markAllRead, openNotification } from './actions'

export default async function NotificationsPage() {
  await requireUser()
  const supabase = await createClient()

  const { data } = await supabase
    .from('notifications')
    .select('id, title, body, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const notifications = data ?? []
  const now = currentTime()
  const hasUnread = notifications.some((n) => !n.read_at)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Notifications"
        description="Updates about your tasks and leave."
        actions={
          hasUnread && (
            <form action={markAllRead}>
              <Button type="submit" variant="outline">
                Mark all as read
              </Button>
            </form>
          )
        }
      />

      <Card className="py-0">
        {notifications.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          <ul className="divide-y divide-border">
            {notifications.map((n) => (
              <li key={n.id}>
                <form action={openNotification}>
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit" className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-muted/50">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-gold'}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${n.read_at ? 'text-foreground/75' : 'font-semibold text-foreground'}`}>
                        {n.title}
                      </span>
                      {n.body && <span className="block text-sm text-muted-foreground">{n.body}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(n.created_at, now)}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
