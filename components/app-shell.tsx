import Image from 'next/image'
import Link from 'next/link'
import type { UIMessage } from 'ai'
import { LogOut } from 'lucide-react'
import { logout } from '@/app/login/actions'
import { TopNav, SubNav } from '@/components/top-nav'
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
    <div className="flex min-h-screen flex-col bg-background">
      <div className="sticky top-0 z-30 print:hidden">
        <header className="flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 py-2.5 text-sidebar-foreground md:px-8">
          <MobileNav enabledModules={enabledModules} isAdmin={isAdmin} />
          <Link href="/dashboard" className="shrink-0 rounded-lg bg-white px-2.5 py-1 shadow-sm">
            <Image src="/byc-logo.png" alt="BYC Consulting" width={1600} height={664} priority className="h-7 w-auto" />
          </Link>
          <TopNav enabledModules={enabledModules} isAdmin={isAdmin} />
          <div className="ml-auto flex items-center gap-2">
            <CommandPalette enabledModules={enabledModules} isAdmin={isAdmin} />
            <ThemeToggle />
            <Link
              href="/profile"
              className="flex items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent/50 py-1 pr-3 pl-1 hover:bg-sidebar-accent"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                {initialsFor(user.name)}
              </span>
              <span className="hidden text-sm font-medium sm:inline">{user.name}</span>
            </Link>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="icon" aria-label="Sign out" className="text-sidebar-foreground hover:bg-sidebar-accent">
                <LogOut />
              </Button>
            </form>
          </div>
        </header>
        <SubNav enabledModules={enabledModules} isAdmin={isAdmin} />
      </div>
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 md:px-8 md:py-8 print:max-w-none print:p-0">{children}</main>
      {assistant && (
        <GlobalChatBubble conversationId={assistant.conversationId} initialMessages={assistant.initialMessages} />
      )}
    </div>
  )
}
