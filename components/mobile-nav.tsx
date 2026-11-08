'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { activeItem, activeSection, visibleSections } from '@/lib/nav'
import type { Module } from '@/types/database'

export function MobileNav({ enabledModules, isAdmin }: { enabledModules: Module[]; isAdmin: boolean }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const sections = visibleSections(enabledModules, isAdmin)
  const current = activeSection(sections, pathname)

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="text-sidebar-foreground hover:bg-sidebar-accent lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu />
      </Button>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-sidebar px-3 py-4 text-sidebar-foreground">
            <div className="mb-4 flex justify-end">
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close menu">
                <X />
              </Button>
            </div>
            <nav className="space-y-5">
              {sections.map((section) => {
                const Icon = section.icon
                const item = section === current ? activeItem(section, pathname) : undefined
                return (
                  <div key={section.label} className="space-y-1">
                    <p className="flex items-center gap-2 px-3 text-[0.68rem] font-semibold tracking-wider text-sidebar-foreground/50 uppercase">
                      <Icon className="h-3.5 w-3.5" />
                      {section.label}
                    </p>
                    {section.items.map((entry) => (
                      <Link
                        key={entry.href}
                        href={entry.href}
                        onClick={() => setOpen(false)}
                        className={`block rounded-xl px-3 py-2 text-sm font-medium ${
                          entry === item
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60'
                        }`}
                      >
                        {entry.label}
                      </Link>
                    ))}
                  </div>
                )
              })}
            </nav>
          </aside>
        </div>
      )}
    </>
  )
}
