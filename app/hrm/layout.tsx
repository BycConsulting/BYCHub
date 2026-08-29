import Link from 'next/link'
import { LayoutGrid, LogOut } from 'lucide-react'
import { requireUser, getEnabledModules } from '@/lib/access'
import { logout } from '@/app/login/actions'

function initialsFor(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default async function HrmLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const enabledModules = await getEnabledModules(user.role)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-sm font-bold text-white">
            B
          </div>
          <span className="text-base font-semibold text-slate-800">BYC HRM</span>
        </div>
        <nav className="flex flex-col gap-1">
          {enabledModules.includes('directory') && (
            <Link
              href="/hrm/directory"
              className="flex items-center gap-3 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white"
            >
              <LayoutGrid className="h-4 w-4" />
              Directory
            </Link>
          )}
        </nav>
        <Link href="/leads" className="mt-auto px-2 text-xs text-slate-400 hover:text-slate-600">
          &larr; Back to BYC Hub
        </Link>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-sm text-slate-400">BYC HRM</div>
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
