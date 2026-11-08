'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { visibleSections } from '@/lib/nav'
import type { Module } from '@/types/database'

/** Cmd/Ctrl+K quick-jump to any page the user can access. */
export function CommandPalette({ enabledModules, isAdmin }: { enabledModules: Module[]; isAdmin: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const items = useMemo(
    () =>
      visibleSections(enabledModules, isAdmin)
        .flatMap((section) => section.items.map((item) => ({ ...item, icon: section.icon, group: section.label })))
        .filter((item) => `${item.group} ${item.label}`.toLowerCase().includes(query.trim().toLowerCase())),
    [enabledModules, isAdmin, query]
  )

  function go(href: string) {
    setOpen(false)
    setQuery('')
    router.push(href)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search or jump to"
        className="flex h-9 items-center gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent/50 px-3 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent sm:w-52"
      >
        <Search className="h-4 w-4" />
        <span className="hidden flex-1 text-left sm:inline">Jump to…</span>
        <kbd className="hidden rounded-md border border-sidebar-border px-1.5 text-[0.68rem] font-medium sm:inline">⌘K</kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-lg">
          <DialogTitle className="sr-only">Quick jump</DialogTitle>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && items[0]) go(items[0].href)
              }}
              placeholder="Type a page name…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul className="max-h-72 overflow-y-auto p-2">
            {items.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.href}>
                  <button
                    type="button"
                    onClick={() => go(item.href)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.group}</span>
                  </button>
                </li>
              )
            })}
            {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No match</li>}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
