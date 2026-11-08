'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { visibleNavGroups } from '@/lib/nav'
import type { Module } from '@/types/database'

export function NavLinks({
  enabledModules,
  isAdmin,
  onNavigate,
}: {
  enabledModules: Module[]
  isAdmin: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-5">
      {visibleNavGroups(enabledModules, isAdmin).map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="px-3 text-[0.68rem] font-semibold tracking-wider text-sidebar-foreground/40 uppercase">
            {group.label}
          </p>
          {group.items.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                }`}
              >
                {active && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-sidebar-primary" />}
                <Icon className={`h-4 w-4 ${active ? 'text-sidebar-primary' : ''}`} />
                {item.label}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
