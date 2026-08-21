import Link from 'next/link'
import { requireUser } from '@/lib/access'
import { logout } from '@/app/login/actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="font-semibold">BYC Hub</span>
          <Link href="/dashboard" className="text-sm text-gray-600 hover:text-black">
            Dashboard
          </Link>
          <Link href="/leads" className="text-sm text-gray-600 hover:text-black">
            Leads
          </Link>
          <Link href="/clients" className="text-sm text-gray-600 hover:text-black">
            Clients
          </Link>
          <Link href="/profile" className="text-sm text-gray-600 hover:text-black">
            Profile
          </Link>
          {user.role === 'admin' && (
            <>
              <Link href="/users" className="text-sm text-gray-600 hover:text-black">
                Users
              </Link>
              <Link href="/settings" className="text-sm text-gray-600 hover:text-black">
                Settings
              </Link>
              <Link href="/users/requests" className="text-sm text-gray-600 hover:text-black">
                Requests
              </Link>
            </>
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
