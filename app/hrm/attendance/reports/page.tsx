import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { hoursWorked, todayDate } from '@/lib/attendance'

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

  const summary = new Map<string, { name: string; daysPresent: number; totalHours: number }>()
  for (const record of records ?? []) {
    const entry = summary.get(record.user_id) ?? {
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

      <form className="flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm text-slate-700">
          From
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
        </label>
        <label className="text-sm text-slate-700">
          To
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Filter
        </button>
        <a
          href={`/hrm/attendance/reports/export?from=${from}&to=${to}`}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Download CSV
        </a>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {recordsError ? (
          <p className="p-4 text-sm text-red-700">Could not load attendance records</p>
        ) : summaryRows.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No attendance records in this range.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-4 py-2">Name</th>
                <th>Days present</th>
                <th>Total hours</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.name} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 text-slate-700">{row.name}</td>
                  <td className="text-slate-600">{row.daysPresent}</td>
                  <td className="text-slate-600">{row.totalHours.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
