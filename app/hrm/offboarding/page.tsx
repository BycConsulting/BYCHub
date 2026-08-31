import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { startOffboarding } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormSelect } from '@/components/ui/form-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function OffboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('offboarding')
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: checklists, error: checklistsError } = await admin
    .from('offboarding_checklists')
    .select('id, user_id, started_at, completed_at')
    .order('started_at', { ascending: false })

  const { data: activeUsers, error: usersError } = await admin
    .from('users')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  const checklistUserIds = [...new Set((checklists ?? []).map((c) => c.user_id))]
  const { data: checklistUsers } =
    checklistUserIds.length > 0
      ? await admin.from('users').select('id, name').in('id', checklistUserIds)
      : { data: [] }
  const nameById = new Map((checklistUsers ?? []).map((u) => [u.id, u.name]))

  const inProgressUserIds = new Set((checklists ?? []).filter((c) => !c.completed_at).map((c) => c.user_id))
  const availableUsers = (activeUsers ?? []).filter((u) => !inProgressUserIds.has(u.id))

  const inProgress = (checklists ?? []).filter((c) => !c.completed_at)
  const completed = (checklists ?? []).filter((c) => c.completed_at)

  const userOptions = availableUsers.map((u) => ({ value: u.id, label: u.name }))

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">Offboarding</h1>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <Card>
        <CardContent>
          <form action={startOffboarding} className="flex items-end gap-3">
            <label className="flex-1 text-sm text-slate-700">
              Start offboarding for
              <FormSelect
                name="userId"
                options={userOptions}
                placeholder="Select an employee"
                className="mt-1 w-full"
              />
            </label>
            <Button type="submit">Start</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardHeader className="pt-4">
          <CardTitle className="text-lg">In progress</CardTitle>
        </CardHeader>
        {checklistsError || usersError ? (
          <CardContent className="pb-4">
            <p className="text-sm text-red-700">Could not load offboarding checklists</p>
          </CardContent>
        ) : inProgress.length === 0 ? (
          <CardContent className="pb-4">
            <p className="text-sm text-slate-500">No offboarding in progress.</p>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inProgress.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/hrm/offboarding/${c.id}`} className="font-medium text-slate-800 hover:underline">
                      {nameById.get(c.user_id) ?? 'Unknown'}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-400">{c.started_at.slice(0, 10)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {completed.length > 0 && (
        <Card className="py-0">
          <CardHeader className="pt-4">
            <CardTitle className="text-lg">Completed</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {completed.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/hrm/offboarding/${c.id}`} className="font-medium text-slate-800 hover:underline">
                      {nameById.get(c.user_id) ?? 'Unknown'}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-400">{c.completed_at!.slice(0, 10)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
