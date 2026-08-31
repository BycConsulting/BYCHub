import Link from 'next/link'
import { cookies } from 'next/headers'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { clearInviteResult, deactivateUser, deleteUser, inviteUser, reactivateUser, resetUserPassword } from './actions'
import { DeleteUserButton } from './delete-user-button'
import { INVITE_RESULT_COOKIE, parseInviteResult } from './invite-result'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { FormSelect } from '@/components/ui/form-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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

  const roleOptions = [
    { value: 'employee', label: 'Employee' },
    { value: 'hr', label: 'HR' },
    ...(currentUser.role === 'admin' ? [{ value: 'admin', label: 'Admin' }] : []),
  ]

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <Link href="/users/config" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
            HR configuration
          </Link>
          <CardTitle className="mt-2 text-lg">Invite user</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
          )}
          {inviteResult && (
            <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-2 text-sm text-green-700">
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
          <form action={inviteUser} className="grid grid-cols-3 gap-3">
            <Input name="name" placeholder="Full name" required />
            <Input name="email" type="email" placeholder="Email" required />
            <FormSelect name="role" options={roleOptions} defaultValue="employee" />
            <Button type="submit" className="col-span-3">
              Create user
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardHeader className="pt-4">
          <CardTitle className="text-lg">Users</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allUsers.map((u) => {
              const isSelf = u.id === currentUser.id
              const owned = ownedCounts.get(u.id) ?? 0
              const reassignTargets = activeUsers.filter((other) => other.id !== u.id)
              const reassignOptions = reassignTargets.map((target) => ({ value: target.id, label: target.name }))

              return (
                <TableRow key={u.id} className="align-top">
                  <TableCell>
                    <Link href={`/users/${u.id}`} className="font-medium text-slate-800 hover:underline">
                      {u.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-600">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.is_active ? 'default' : 'secondary'}>
                      {u.is_active ? 'Active' : 'Deactivated'}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-y-2 py-2">
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
                            <FormSelect
                              name="reassignToUserId"
                              options={reassignOptions}
                              placeholder={`Reassign ${owned} record${owned === 1 ? '' : 's'} to…`}
                              className="h-7 text-xs"
                            />
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
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
