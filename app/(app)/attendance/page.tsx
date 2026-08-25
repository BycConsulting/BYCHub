import type { PostgrestError } from '@supabase/supabase-js'
import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { formatIstTime, hoursWorked, todayDate } from '@/lib/attendance'
import { checkIn, checkOut } from './actions'

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await requireUser()
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
  const reportIds = (myReports ?? []).map((report) => report.user_id)

  let teamToday: {
    user_id: string
    checked_in_at: string | null
    checked_out_at: string | null
  }[] = []
  let teamNameById = new Map<string, string>()
  let teamRecordsError: PostgrestError | null = null

  if (reportIds.length > 0) {
    const { data: records, error: recordsErr } = await admin
      .from('attendance_records')
      .select('user_id, checked_in_at, checked_out_at')
      .in('user_id', reportIds)
      .eq('date', today)
    teamToday = records ?? []
    teamRecordsError = recordsErr

    const { data: reportUsers } = await admin.from('users').select('id, name').in('id', reportIds)
    teamNameById = new Map((reportUsers ?? []).map((user) => [user.id, user.name]))
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Attendance</h1>
        {error && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4">
          {!todayRecord?.checked_in_at ? (
            <form action={checkIn}>
              <button type="submit" className="rounded bg-black px-4 py-2 text-white">
                Check In
              </button>
            </form>
          ) : !todayRecord.checked_out_at ? (
            <form action={checkOut}>
              <button type="submit" className="rounded bg-black px-4 py-2 text-white">
                Check Out
              </button>
            </form>
          ) : (
            <p className="text-sm text-gray-500">Checked out for today.</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">My history</h2>
        {recordsError ? (
          <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">Could not load your attendance history</p>
        ) : myRecords && myRecords.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {myRecords.map((record) => {
              const hours = record.checked_in_at ? hoursWorked(record.checked_in_at, record.checked_out_at) : null
              return (
                <li key={record.id} className="rounded border p-3 text-sm">
                  <span className="font-medium">{record.date}</span> —{' '}
                  {record.checked_in_at ? formatIstTime(record.checked_in_at) : '—'} to{' '}
                  {record.checked_out_at ? formatIstTime(record.checked_out_at) : 'not checked out'}
                  {hours !== null && <> ({hours}h)</>}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-gray-500">No attendance records yet.</p>
        )}
      </div>

      {(reportsError || reportIds.length > 0) && (
        <div>
          <h2 className="text-lg font-semibold">My team&apos;s attendance</h2>
          {reportsError ? (
            <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">Could not load your team</p>
          ) : teamRecordsError ? (
            <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">Could not load your team&apos;s attendance</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {reportIds.map((reportId) => {
                const record = teamToday.find((r) => r.user_id === reportId)
                const status = !record?.checked_in_at
                  ? 'not checked in today'
                  : !record.checked_out_at
                    ? `checked in at ${formatIstTime(record.checked_in_at)}`
                    : `${formatIstTime(record.checked_in_at)} to ${formatIstTime(record.checked_out_at)}`
                return (
                  <li key={reportId} className="rounded border p-3 text-sm">
                    <span className="font-medium">{teamNameById.get(reportId) ?? 'Unknown'}</span> — {status}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
