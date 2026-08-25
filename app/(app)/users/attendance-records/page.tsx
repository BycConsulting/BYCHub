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
      <h1 className="text-lg font-semibold">Attendance records</h1>
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
      {recordsError ? (
        <p className="rounded bg-red-50 p-2 text-sm text-red-600">Could not load attendance records</p>
      ) : sortedRecords.length === 0 ? (
        <p className="text-sm text-gray-500">No attendance records in the last 30 days.</p>
      ) : (
        <ul className="space-y-3">
          {sortedRecords.map((record) => (
            <li key={record.id} className="rounded border p-4">
              <p className="text-sm font-medium">
                {nameById.get(record.user_id) ?? 'Unknown'} — {record.date}
                {record.checked_in_at && !record.checked_out_at && (
                  <span className="ml-2 text-xs font-normal text-amber-600">missing checkout</span>
                )}
              </p>
              <form action={correctAttendanceRecord} className="mt-2 flex flex-wrap items-end gap-3">
                <input type="hidden" name="recordId" value={record.id} />
                <label className="text-sm">
                  Checked in
                  <input
                    type="datetime-local"
                    name="checkedInAt"
                    defaultValue={record.checked_in_at ? utcIsoToIstWallClock(record.checked_in_at) : ''}
                    className="mt-1 block rounded border px-2 py-1"
                  />
                </label>
                <label className="text-sm">
                  Checked out
                  <input
                    type="datetime-local"
                    name="checkedOutAt"
                    defaultValue={record.checked_out_at ? utcIsoToIstWallClock(record.checked_out_at) : ''}
                    className="mt-1 block rounded border px-2 py-1"
                  />
                </label>
                <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">
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
