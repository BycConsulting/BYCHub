import Image from 'next/image'
import type { UIMessage } from 'ai'
import { LogOut } from 'lucide-react'
import { logout } from '@/app/login/actions'
import { NavLinks } from '@/components/nav-links'
import { MobileNav } from '@/components/mobile-nav'
import { CommandPalette } from '@/components/command-palette'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { GlobalChatBubble } from '@/components/global-chat-bubble'
import type { CurrentUser } from '@/lib/access'
import type { Module } from '@/types/database'

function initialsFor(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function AppShell({
  user,
  enabledModules,
  assistant,
  children,
}: {
  user: CurrentUser
  enabledModules: Module[]
  assistant: { conversationId: string; initialMessages: UIMessage[] } | null
  children: React.ReactNode
}) {
  const isAdmin = user.role === 'admin'

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="print:hidden sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 text-sidebar-foreground lg:flex">
        <div className="mb-7 px-1">
          <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
            <Image src="/byc-logo.png" alt="BYC Consulting" width={1600} height={664} priority className="h-8 w-auto" />
          </div>
          <span className="mt-2 block px-1 text-[0.7rem] font-semibold tracking-widest text-sidebar-primary uppercase">
            Hub
          </span>
        </div>
        <div className="-mr-2 flex-1 overflow-y-auto pr-2">
          <NavLinks enabledModules={enabledModules} isAdmin={isAdmin} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="print:hidden sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md md:px-8">
          <MobileNav enabledModules={enabledModules} isAdmin={isAdmin} />
          <CommandPalette enabledModules={enabledModules} isAdmin={isAdmin} />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <div className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {initialsFor(user.name)}
              </div>
              <span className="hidden text-sm font-medium sm:inline">{user.name}</span>
            </div>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
                <LogOut />
              </Button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8 print:p-0">{children}</main>
      </div>
      {assistant && (
        <GlobalChatBubble conversationId={assistant.conversationId} initialMessages={assistant.initialMessages} />
      )}
    </div>
  )
}
