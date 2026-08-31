import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { formatIstTime, hoursWorked, todayDate } from '@/lib/attendance'
import { checkIn, checkOut } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await requireModule('leave_attendance')
  const { error } = await searchParams

  const supabase = await createClient()

  const { data: myRecords, error: recordsError } = await supabase
    .from('attendance_records')
    .select('id, date, checked_in_at, checked_out_at')
    .eq('user_id', currentUser.id)
    .order('date', { ascending: false })
    .limit(30)

  const today = todayDate()
  const todayRecord = (myRecords ?? []).find((record) => record.date === today)

  const admin = createAdminSupabaseClient()
  const { data: myReports, error: reportsError } = await admin
    .from('employee_profiles')
    .select('user_id')
    .eq('manager_id', currentUser.id)
  const hasReports = (myReports ?? []).length > 0

  const canManage = currentUser.role === 'hr' || currentUser.role === 'admin'

  return (
    <div className="space-y-8">
      <div className="flex gap-4">
        {hasReports && (
          <Link href="/hrm/attendance/team" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
            My team
          </Link>
        )}
        {canManage && (
          <>
            <Link
              href="/hrm/attendance/reports"
              className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
            >
              Reports
            </Link>
            <Link
              href="/hrm/attendance/shifts"
              className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
            >
              Shifts
            </Link>
            <Link
              href="/hrm/attendance/records"
              className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
            >
              Correct records
            </Link>
          </>
        )}
      </div>

      {reportsError && (
        <p className="text-sm text-red-600">Could not check your team — try refreshing.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Attendance</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
          )}

          {!todayRecord?.checked_in_at ? (
            <form action={checkIn}>
              <Button type="submit">Check In</Button>
            </form>
          ) : !todayRecord.checked_out_at ? (
            <form action={checkOut}>
              <Button type="submit">Check Out</Button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">Checked out for today.</p>
          )}
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardHeader className="pt-4">
          <CardTitle className="text-lg">My history</CardTitle>
        </CardHeader>
        {recordsError ? (
          <CardContent className="pb-4">
            <p className="text-sm text-red-700">Could not load your attendance history</p>
          </CardContent>
        ) : myRecords && myRecords.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Checked in</TableHead>
                <TableHead>Checked out</TableHead>
                <TableHead>Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {myRecords.map((record) => {
                const hours = record.checked_in_at ? hoursWorked(record.checked_in_at, record.checked_out_at) : null
                return (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium text-slate-800">{record.date}</TableCell>
                    <TableCell className="text-slate-600">
                      {record.checked_in_at ? formatIstTime(record.checked_in_at) : '—'}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {record.checked_out_at ? formatIstTime(record.checked_out_at) : 'not checked out'}
                    </TableCell>
                    <TableCell className="text-slate-600">{hours !== null ? `${hours}h` : '—'}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <CardContent className="pb-4">
            <p className="text-sm text-slate-500">No attendance records yet.</p>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
