import Link from 'next/link'
import { requireUser, getEnabledModules } from '@/lib/access'
import { logout } from '@/app/login/actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const enabledModules = await getEnabledModules(user.role)

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="font-semibold">BYC Hub</span>
          {enabledModules.includes('dashboard') && (
            <Link href="/dashboard" className="text-sm text-gray-600 hover:text-black">
              Dashboard
            </Link>
          )}
          {enabledModules.includes('leads') && (
            <Link href="/leads" className="text-sm text-gray-600 hover:text-black">
              Leads
            </Link>
          )}
          {enabledModules.includes('clients') && (
            <Link href="/clients" className="text-sm text-gray-600 hover:text-black">
              Clients
            </Link>
          )}
          <Link href="/profile" className="text-sm text-gray-600 hover:text-black">
            Profile
          </Link>
          <Link href="/leave" className="text-sm text-gray-600 hover:text-black">
            Leave
          </Link>
          {enabledModules.includes('hr') && (
            <Link href="/users" className="text-sm text-gray-600 hover:text-black">
              HR
            </Link>
          )}
          {enabledModules.includes('settings') && (
            <Link href="/settings" className="text-sm text-gray-600 hover:text-black">
              Settings
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>{user.name}</span>
          <form action={logout}>
            <button type="submit" className="text-gray-600 underline hover:text-black">
              Sign out
            </button>
          </form>
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  )
}
