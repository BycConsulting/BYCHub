import { LogOut } from 'lucide-react'
import { logout } from '@/app/login/actions'
import { NavLinks } from '@/components/nav-links'
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
  children,
}: {
  user: CurrentUser
  enabledModules: Module[]
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-sm font-bold text-white">
            B
          </div>
          <span className="text-base font-semibold text-slate-800">BYC Hub</span>
        </div>
        <NavLinks enabledModules={enabledModules} />
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-sm text-slate-400">BYC Hub</div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
              {initialsFor(user.name)}
            </div>
            <span className="text-sm font-medium text-slate-700">{user.name}</span>
            <form action={logout}>
              <button
                type="submit"
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  )
}
