'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import { fetchUnreadCount } from '@/app/(app)/notifications/actions'

/** The shared layout does not re-render on client navigation, so the count is re-read whenever the route changes. */
export function NotificationBell({ count: initialCount }: { count: number }) {
  const pathname = usePathname()
  const [count, setCount] = useState(initialCount)
  const [seenInitial, setSeenInitial] = useState(initialCount)

  if (seenInitial !== initialCount) {
    setSeenInitial(initialCount)
    setCount(initialCount)
  }

  useEffect(() => {
    let active = true
    fetchUnreadCount()
      .then((latest) => {
        if (active) setCount(latest)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [pathname])

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
