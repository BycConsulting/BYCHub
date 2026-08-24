import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { hoursWorked, todayDate } from '@/lib/attendance'
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
                  {record.checked_in_at ? new Date(record.checked_in_at).toLocaleTimeString() : '—'} to{' '}
                  {record.checked_out_at ? new Date(record.checked_out_at).toLocaleTimeString() : 'not checked out'}
                  {hours !== null && <> ({hours}h)</>}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-gray-500">No attendance records yet.</p>
        )}
      </div>
    </div>
  )
}
