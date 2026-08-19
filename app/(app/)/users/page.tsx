import { requireAdmin } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { inviteUser } from './actions'

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; tempPassword?: string; for?: string }>
}) {
  await requireAdmin()
  const { error, tempPassword, for: invitedEmail } = await searchParams

  const supabase = await createClient()
  const { data: users } = await supabase
    .from('users')
    .select('id, email, name, role, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Invite user</h1>
        {error && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        {tempPassword && (
          <p className="mt-2 rounded bg-green-50 p-2 text-sm text-green-700">
            Created {invitedEmail}. Temporary password: <strong>{tempPassword}</strong> — share this with them
            directly, it will not be shown again.
          </p>
        )}
        <form action={inviteUser} className="mt-3 grid grid-cols-3 gap-3">
          <input name="name" placeholder="Full name" required className="rounded border px-3 py-2" />
          <input name="email" type="email" placeholder="Email" required className="rounded border px-3 py-2" />
          <select name="role" className="rounded border px-3 py-2">
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" className="col-span-3 rounded bg-black py-2 text-white">
            Create user
          </button>
        </form>
      </div>

      <div>
        <h1 className="text-lg font-semibold">Users</h1>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="py-2">Name</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id} className="border-b">
                <td className="py-2">{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
