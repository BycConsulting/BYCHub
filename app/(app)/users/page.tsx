import Link from 'next/link'
import { cookies } from 'next/headers'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { clearInviteResult, deactivateUser, deleteUser, inviteUser, reactivateUser, resetUserPassword } from './actions'
import { DeleteUserButton } from './delete-user-button'
import { INVITE_RESULT_COOKIE, parseInviteResult } from './invite-result'

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await requireModule('hr')
  const { error } = await searchParams

  // The temp password arrives in a short-lived httpOnly cookie, never the URL.
  const cookieStore = await cookies()
  const inviteResult = parseInviteResult(cookieStore.get(INVITE_RESULT_COOKIE)?.value)

  const supabase = await createClient()
  const { data: users } = await supabase
    .from('users')
    .select('id, email, name, role, is_active, created_at')
    .order('created_at', { ascending: false })

  const allUsers = users ?? []
  const activeUsers = allUsers.filter((u) => u.is_active)

  const ownedCounts = new Map<string, number>()
  for (const u of allUsers) {
    const { count: leadsCount } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_user_id', u.id)
    const { count: clientsCount } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('owner_user_id', u.id)
    ownedCounts.set(u.id, (leadsCount ?? 0) + (clientsCount ?? 0))
  }

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex gap-4">
          <Link href="/users/config" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
            HR configuration
          </Link>
        </div>
        <h1 className="mt-2 text-lg font-semibold text-slate-800">Invite user</h1>
        {error && (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
        )}
        {inviteResult && (
          <div className="mt-2 rounded-lg border border-green-200 bg-green-50 p-2 text-sm text-green-700">
            <p>
              {inviteResult.action === 'invited' ? 'Created' : 'Reset password for'} {inviteResult.email}. Temporary
              password: <strong>{inviteResult.tempPassword}</strong> — share this with them directly, it will not be
              shown again.
            </p>
            <form action={clearInviteResult}>
              <button type="submit" className="mt-2 underline">
                Dismiss
              </button>
            </form>
          </div>
        )}
        <form action={inviteUser} className="mt-3 grid grid-cols-3 gap-3">
          <input
            name="name"
            placeholder="Full name"
            required
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <select
            name="role"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            <option value="employee">Employee</option>
            <option value="hr">HR</option>
            {currentUser.role === 'admin' && <option value="admin">Admin</option>}
          </select>
          <button
            type="submit"
            className="col-span-3 rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Create user
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h1 className="px-4 pt-4 text-lg font-semibold text-slate-800">Users</h1>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-2">Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {allUsers.map((u) => {
              const isSelf = u.id === currentUser.id
              const owned = ownedCounts.get(u.id) ?? 0
              const reassignTargets = activeUsers.filter((other) => other.id !== u.id)

              return (
                <tr key={u.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/users/${u.id}`} className="font-medium text-slate-800 hover:underline">
                      {u.name}
                    </Link>
                  </td>
                  <td className="text-slate-600">{u.email}</td>
                  <td className="text-slate-600">{u.role}</td>
                  <td className="text-slate-600">{u.is_active ? 'Active' : 'Deactivated'}</td>
                  <td className="space-y-2 py-2">
                    {isSelf && <span className="text-slate-400">You</span>}
                    {!isSelf && u.is_active && (
                      <>
                        <form action={resetUserPassword}>
                          <input type="hidden" name="userId" value={u.id} />
                          <button type="submit" className="text-slate-600 underline hover:text-slate-900">
                            Reset password
                          </button>
                        </form>
                        <form action={deactivateUser} className="flex items-center gap-2">
                          <input type="hidden" name="userId" value={u.id} />
                          {owned > 0 && (
                            <select
                              name="reassignToUserId"
                              required
                              defaultValue=""
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                            >
                              <option value="" disabled>
                                Reassign {owned} record{owned === 1 ? '' : 's'} to…
                              </option>
                              {reassignTargets.map((target) => (
                                <option key={target.id} value={target.id}>
                                  {target.name}
                                </option>
                              ))}
                            </select>
                          )}
                          <button type="submit" className="text-red-600 underline">
                            Deactivate
                          </button>
                        </form>
                      </>
                    )}
                    {!isSelf && !u.is_active && (
                      <>
                        <form action={reactivateUser}>
                          <input type="hidden" name="userId" value={u.id} />
                          <button type="submit" className="text-green-700 underline">
                            Reactivate
                          </button>
                        </form>
                        {currentUser.role === 'admin' && (
                          <DeleteUserButton userId={u.id} userEmail={u.email} action={deleteUser} />
                        )}
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
