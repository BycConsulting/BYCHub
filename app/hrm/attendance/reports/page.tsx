import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { hoursWorked, todayDate } from '@/lib/attendance'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

function firstOfMonth(): string {
  return `${todayDate().slice(0, 7)}-01`
}

export default async function AttendanceReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const currentUser = await requireModule('leave_attendance')
  if (currentUser.role !== 'hr' && currentUser.role !== 'admin') {
    redirect('/hrm/attendance')
  }

  const { from: fromRaw, to: toRaw } = await searchParams
  const from = fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : firstOfMonth()
  const to = toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? toRaw : todayDate()

  const admin = createAdminSupabaseClient()
  const { data: records, error: recordsError } = await admin
    .from('attendance_records')
    .select('user_id, date, checked_in_at, checked_out_at')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })

  const userIds = [...new Set((records ?? []).map((r) => r.user_id))]
  const { data: users } =
    userIds.length > 0 ? await admin.from('users').select('id, name').in('id', userIds) : { data: [] }
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]))

  const summary = new Map<string, { userId: string; name: string; daysPresent: number; totalHours: number }>()
  for (const record of records ?? []) {
    const entry = summary.get(record.user_id) ?? {
      userId: record.user_id,
      name: nameById.get(record.user_id) ?? 'Unknown',
      daysPresent: 0,
      totalHours: 0,
    }
    entry.daysPresent += 1
    const hours = record.checked_in_at ? hoursWorked(record.checked_in_at, record.checked_out_at) : null
    if (hours !== null) entry.totalHours += hours
    summary.set(record.user_id, entry)
  }
  const summaryRows = [...summary.values()].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/hrm/attendance" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to Attendance
      </Link>
      <h1 className="text-xl font-semibold text-slate-800">Attendance reports</h1>

      <Card>
        <CardContent>
          <form className="flex items-end gap-3">
            <label className="text-sm text-slate-700">
              From
              <Input type="date" name="from" defaultValue={from} className="mt-1" />
            </label>
            <label className="text-sm text-slate-700">
              To
              <Input type="date" name="to" defaultValue={to} className="mt-1" />
            </label>
            <Button type="submit">Filter</Button>
            <a
              href={`/hrm/attendance/reports/export?from=${from}&to=${to}`}
              className={buttonVariants({ variant: 'outline' })}
            >
              Download CSV
            </a>
          </form>
        </CardContent>
      </Card>

      <Card className="py-0">
        {recordsError ? (
          <CardContent className="py-4">
            <p className="text-sm text-red-700">Could not load attendance records</p>
          </CardContent>
        ) : summaryRows.length === 0 ? (
          <CardContent className="py-4">
            <p className="text-sm text-slate-500">No attendance records in this range.</p>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Days present</TableHead>
                <TableHead>Total hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaryRows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell className="text-slate-700">{row.name}</TableCell>
                  <TableCell className="text-slate-600">{row.daysPresent}</TableCell>
                  <TableCell className="text-slate-600">{row.totalHours.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
