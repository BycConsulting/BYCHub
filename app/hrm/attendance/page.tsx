import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { formatIstTime, hoursWorked, todayDate } from '@/lib/attendance'
import { checkIn, checkOut } from './actions'

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

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_0_rgba(30,41,59,0.06),0_2px_6px_-1px_rgba(30,41,59,0.08)]">
        <h1 className="text-lg font-semibold text-slate-800">Attendance</h1>
        {error && (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
        )}

        <div className="mt-4">
          {!todayRecord?.checked_in_at ? (
            <form action={checkIn}>
              <button
                type="submit"
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 active:scale-[0.98] transition-transform"
              >
                Check In
              </button>
            </form>
          ) : !todayRecord.checked_out_at ? (
            <form action={checkOut}>
              <button
                type="submit"
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 active:scale-[0.98] transition-transform"
              >
                Check Out
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">Checked out for today.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_0_rgba(30,41,59,0.06),0_2px_6px_-1px_rgba(30,41,59,0.08)]">
        <h2 className="text-lg font-semibold text-slate-800">My history</h2>
        {recordsError ? (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            Could not load your attendance history
          </p>
        ) : myRecords && myRecords.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {myRecords.map((record) => {
              const hours = record.checked_in_at ? hoursWorked(record.checked_in_at, record.checked_out_at) : null
              return (
                <li key={record.id} className="rounded-lg border border-slate-100 p-3 text-sm text-slate-700">
                  <span className="font-medium text-slate-800">{record.date}</span> —{' '}
                  {record.checked_in_at ? formatIstTime(record.checked_in_at) : '—'} to{' '}
                  {record.checked_out_at ? formatIstTime(record.checked_out_at) : 'not checked out'}
                  {hours !== null && <> ({hours}h)</>}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No attendance records yet.</p>
        )}
      </div>
    </div>
  )
}
