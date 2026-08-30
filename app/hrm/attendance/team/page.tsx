import type { PostgrestError } from '@supabase/supabase-js'
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { formatIstTime, todayDate } from '@/lib/attendance'

export default async function AttendanceTeamPage() {
  const currentUser = await requireModule('leave_attendance')
  const today = todayDate()
  const admin = createAdminSupabaseClient()

  const { data: myReports, error: reportsError } = await admin
    .from('employee_profiles')
    .select('user_id, shift_id')
    .eq('manager_id', currentUser.id)
  const reportIds = (myReports ?? []).map((report) => report.user_id)
  const shiftIdByUser = new Map((myReports ?? []).map((report) => [report.user_id, report.shift_id]))

  let teamToday: {
    user_id: string
    checked_in_at: string | null
    checked_out_at: string | null
  }[] = []
  let teamNameById = new Map<string, string>()
  let shiftNameById = new Map<string, string>()
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

    const shiftIds = [...new Set([...shiftIdByUser.values()].filter((id): id is string => id !== null))]
    if (shiftIds.length > 0) {
      const { data: shifts } = await admin.from('shifts').select('id, name').in('id', shiftIds)
      shiftNameById = new Map((shifts ?? []).map((shift) => [shift.id, shift.name]))
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/hrm/attendance" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to Attendance
      </Link>
      <h1 className="text-xl font-semibold text-slate-800">My team&apos;s attendance</h1>

      {reportsError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          Could not load your team
        </p>
      ) : teamRecordsError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          Could not load your team&apos;s attendance
        </p>
      ) : (
        <ul className="space-y-2">
          {reportIds.map((reportId) => {
            const record = teamToday.find((r) => r.user_id === reportId)
            const status = !record?.checked_in_at
              ? 'not checked in today'
              : !record.checked_out_at
                ? `checked in at ${formatIstTime(record.checked_in_at)}`
                : `${formatIstTime(record.checked_in_at)} to ${formatIstTime(record.checked_out_at)}`
            const shiftId = shiftIdByUser.get(reportId)
            const shiftName = shiftId ? (shiftNameById.get(shiftId) ?? 'Unknown shift') : 'No shift assigned'
            return (
              <li
                key={reportId}
                className="rounded-lg border border-slate-100 bg-white p-3 text-sm text-slate-700 shadow-sm"
              >
                <span className="font-medium text-slate-800">{teamNameById.get(reportId) ?? 'Unknown'}</span> —{' '}
                {status} <span className="text-slate-400">· {shiftName}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
