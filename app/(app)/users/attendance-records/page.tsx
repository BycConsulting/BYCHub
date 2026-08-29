import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { utcIsoToIstWallClock } from '@/lib/attendance'
import { correctAttendanceRecord } from './actions'

export default async function AttendanceRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('hr')
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
      <h1 className="text-xl font-semibold text-slate-800">Attendance records</h1>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}
      {recordsError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          Could not load attendance records
        </p>
      ) : sortedRecords.length === 0 ? (
        <p className="text-sm text-slate-500">No attendance records in the last 30 days.</p>
      ) : (
        <ul className="space-y-3">
          {sortedRecords.map((record) => (
            <li key={record.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-800">
                {nameById.get(record.user_id) ?? 'Unknown'} — {record.date}
                {record.checked_in_at && !record.checked_out_at && (
                  <span className="ml-2 text-xs font-normal text-amber-600">missing checkout</span>
                )}
              </p>
              <form action={correctAttendanceRecord} className="mt-2 flex flex-wrap items-end gap-3">
                <input type="hidden" name="recordId" value={record.id} />
                <label className="text-sm text-slate-700">
                  Checked in
                  <input
                    type="datetime-local"
                    name="checkedInAt"
                    defaultValue={record.checked_in_at ? utcIsoToIstWallClock(record.checked_in_at) : ''}
                    className="mt-1 block rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-slate-800 focus:outline-none"
                  />
                </label>
                <label className="text-sm text-slate-700">
                  Checked out
                  <input
                    type="datetime-local"
                    name="checkedOutAt"
                    defaultValue={record.checked_out_at ? utcIsoToIstWallClock(record.checked_out_at) : ''}
                    className="mt-1 block rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-slate-800 focus:outline-none"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
                >
                  Save
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
