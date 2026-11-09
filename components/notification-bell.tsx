import Link from 'next/link'
import { Bell } from 'lucide-react'

export function NotificationBell({ count }: { count: number }) {
  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
      className="relative flex h-9 w-9 items-center justify-center rounded-xl text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[0.65rem] font-semibold text-sidebar">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  )
}
