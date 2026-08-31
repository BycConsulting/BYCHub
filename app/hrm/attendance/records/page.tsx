import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { utcIsoToIstWallClock } from '@/lib/attendance'
import { correctAttendanceRecord } from './actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function AttendanceRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await requireModule('leave_attendance')
  if (currentUser.role !== 'hr' && currentUser.role !== 'admin') {
    redirect('/hrm/attendance')
  }
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const sinceDate = thirtyDaysAgo.toISOString().slice(0, 10)

  const { data: records, error: recordsError } = await admin
    .from('attendance_records')
    .select('id, user_id, date, checked_in_at, checked_out_at')
    .gte('date', sinceDate)
    .order('date', { ascending: false })

  const sortedRecords = [...(records ?? [])].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    const aOpen = Boolean(a.checked_in_at && !a.checked_out_at)
    const bOpen = Boolean(b.checked_in_at && !b.checked_out_at)
    return aOpen === bOpen ? 0 : aOpen ? -1 : 1
  })

  const userIds = [...new Set(sortedRecords.map((record) => record.user_id))]
  const { data: users } =
    userIds.length > 0 ? await admin.from('users').select('id, name').in('id', userIds) : { data: [] }
  const nameById = new Map((users ?? []).map((user) => [user.id, user.name]))

  return (
    <div className="space-y-4">
      <Link href="/hrm/attendance" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to Attendance
      </Link>
      <h1 className="text-xl font-semibold text-slate-800">Attendance records</h1>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <Card className="py-0">
        {recordsError ? (
          <CardContent className="py-4">
            <p className="text-sm text-red-700">Could not load attendance records</p>
          </CardContent>
        ) : sortedRecords.length === 0 ? (
          <CardContent className="py-4">
            <p className="text-sm text-slate-500">No attendance records in the last 30 days.</p>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Correction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRecords.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="align-top font-medium text-slate-800">
                    {nameById.get(record.user_id) ?? 'Unknown'}
                  </TableCell>
                  <TableCell className="align-top text-slate-600">{record.date}</TableCell>
                  <TableCell className="align-top">
                    {record.checked_in_at && !record.checked_out_at && (
                      <Badge variant="secondary">missing checkout</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <form action={correctAttendanceRecord} className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="recordId" value={record.id} />
                      <label className="text-sm text-slate-700">
                        Checked in
                        <Input
                          type="datetime-local"
                          name="checkedInAt"
                          defaultValue={record.checked_in_at ? utcIsoToIstWallClock(record.checked_in_at) : ''}
                          className="mt-1"
                        />
                      </label>
                      <label className="text-sm text-slate-700">
                        Checked out
                        <Input
                          type="datetime-local"
                          name="checkedOutAt"
                          defaultValue={record.checked_out_at ? utcIsoToIstWallClock(record.checked_out_at) : ''}
                          className="mt-1"
                        />
                      </label>
                      <Button type="submit">Save</Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
