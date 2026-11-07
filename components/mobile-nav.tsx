'use client'

import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NavLinks } from '@/components/nav-links'
import type { Module } from '@/types/database'

export function MobileNav({ enabledModules, isAdmin }: { enabledModules: Module[]; isAdmin: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
        <Menu />
      </Button>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-sidebar px-3 py-4 text-sidebar-foreground">
            <div className="mb-4 flex justify-end">
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close menu">
                <X />
              </Button>
            </div>
            <NavLinks enabledModules={enabledModules} isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  )
}
