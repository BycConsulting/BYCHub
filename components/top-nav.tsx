'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { activeItem, activeSection, visibleSections } from '@/lib/nav'
import type { Module } from '@/types/database'

/** The main menu: one entry per section. */
export function TopNav({ enabledModules, isAdmin }: { enabledModules: Module[]; isAdmin: boolean }) {
  const pathname = usePathname()
  const sections = visibleSections(enabledModules, isAdmin)
  const current = activeSection(sections, pathname)

  return (
    <nav className="hidden items-center gap-1 lg:flex">
      {sections.map((section) => {
        const Icon = section.icon
        const active = section === current
        return (
          <Link
            key={section.label}
            href={section.href}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
            }`}
          >
            <Icon className={`h-4 w-4 ${active ? 'text-sidebar-primary' : ''}`} />
            {section.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** The second row: the functions inside the current section. Hidden when a section has only one. */
export function SubNav({ enabledModules, isAdmin }: { enabledModules: Module[]; isAdmin: boolean }) {
  const pathname = usePathname()
  const sections = visibleSections(enabledModules, isAdmin)
  const section = activeSection(sections, pathname)

  if (!section || section.items.length < 2) return null
  const current = activeItem(section, pathname)

  return (
    <div className="border-b border-border bg-card px-4 md:px-8">
      <div className="-mb-px flex gap-1 overflow-x-auto">
        {section.items.map((item) => {
          const active = item === current
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'border-gold text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
