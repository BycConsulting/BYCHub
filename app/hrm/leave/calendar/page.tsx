import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { LEAVE_TYPE_LABELS } from '@/lib/leave'
import { todayDate } from '@/lib/attendance'
import type { LeaveRequestType } from '@/types/database'

function shiftMonth(monthParam: string, delta: number): string {
  const [y, m] = monthParam.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function buildCalendarWeeks(monthParam: string): { date: string; inMonth: boolean }[][] {
  const [year, month] = monthParam.split('-').map(Number)
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1))
  const startDow = firstOfMonth.getUTCDay()
  const cursor = new Date(firstOfMonth)
  cursor.setUTCDate(firstOfMonth.getUTCDate() - startDow)

  const weeks: { date: string; inMonth: boolean }[][] = []
  for (let w = 0; w < 6; w++) {
    const week: { date: string; inMonth: boolean }[] = []
    for (let d = 0; d < 7; d++) {
      week.push({ date: cursor.toISOString().slice(0, 10), inMonth: cursor.getUTCMonth() === month - 1 })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default async function LeaveCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; scope?: string }>
}) {
  const currentUser = await requireModule('leave_attendance')
  const { month: monthRaw, scope: scopeRaw } = await searchParams

  const monthParam = monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : todayDate().slice(0, 7)
  const canViewCompany = currentUser.role === 'hr' || currentUser.role === 'admin'
  const scope = scopeRaw === 'company' && canViewCompany ? 'company' : 'team'

  const weeks = buildCalendarWeeks(monthParam)
  const gridStart = weeks[0][0].date
  const gridEnd = weeks[5][6].date

  const admin = createAdminSupabaseClient()

  let scopeUserIds: string[] = [currentUser.id]
  if (scope === 'company') {
    const { data: activeUsers } = await admin.from('users').select('id').eq('is_active', true)
    scopeUserIds = (activeUsers ?? []).map((u) => u.id)
  } else {
    const { data: reports } = await admin.from('employee_profiles').select('user_id').eq('manager_id', currentUser.id)
    scopeUserIds = [currentUser.id, ...(reports ?? []).map((r) => r.user_id)]
  }

  const { data: leaveRows, error: leaveError } = await admin
    .from('leave_requests')
    .select('user_id, type, start_date, end_date')
    .eq('status', 'approved')
    .in('user_id', scopeUserIds)
    .lte('start_date', gridEnd)
    .gte('end_date', gridStart)

  const { data: holidayRows, error: holidayError } = await admin
    .from('holidays')
    .select('date, name')
    .gte('date', gridStart)
    .lte('date', gridEnd)

  const { data: users } = await admin.from('users').select('id, name').in('id', scopeUserIds)
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]))

  const holidayByDate = new Map((holidayRows ?? []).map((h) => [h.date, h.name]))
  const leaveByDate = new Map<string, { name: string; type: LeaveRequestType }[]>()
  for (const row of leaveRows ?? []) {
    for (const week of weeks) {
      for (const cell of week) {
        if (cell.date >= row.start_date && cell.date <= row.end_date) {
          const list = leaveByDate.get(cell.date) ?? []
          list.push({ name: nameById.get(row.user_id) ?? 'Unknown', type: row.type })
          leaveByDate.set(cell.date, list)
        }
      }
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/hrm/leave" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to Leave
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Leave calendar — {monthParam}</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={`/hrm/leave/calendar?month=${shiftMonth(monthParam, -1)}&scope=${scope}`}
            className="text-slate-600 hover:text-slate-900"
          >
            ← Prev
          </Link>
          <Link
            href={`/hrm/leave/calendar?month=${shiftMonth(monthParam, 1)}&scope=${scope}`}
            className="text-slate-600 hover:text-slate-900"
          >
            Next →
          </Link>
          {canViewCompany && (
            <Link
              href={`/hrm/leave/calendar?month=${monthParam}&scope=${scope === 'company' ? 'team' : 'company'}`}
              className="rounded-lg border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-50"
            >
              {scope === 'company' ? 'Show my team' : 'Show company-wide'}
            </Link>
          )}
        </div>
      </div>

      {(leaveError || holidayError) && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Could not load calendar data
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b border-slate-200 text-center text-xs font-medium text-slate-500">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-2">
              {label}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].date} className="grid grid-cols-7 border-b border-slate-100 last:border-0">
            {week.map((cell) => {
              const holidayName = holidayByDate.get(cell.date)
              const entries = leaveByDate.get(cell.date) ?? []
              return (
                <div
                  key={cell.date}
                  className={`min-h-24 border-r border-slate-100 p-2 text-xs last:border-0 ${
                    cell.inMonth ? '' : 'bg-slate-50 text-slate-300'
                  }`}
                >
                  <div className={cell.inMonth ? 'text-slate-700' : 'text-slate-300'}>
                    {Number(cell.date.slice(8, 10))}
                  </div>
                  {holidayName && (
                    <div className="mt-1 truncate rounded bg-amber-100 px-1 py-0.5 text-amber-800">
                      {holidayName}
                    </div>
                  )}
                  {entries.map((entry, i) => (
                    <div key={i} className="mt-1 truncate rounded bg-slate-100 px-1 py-0.5 text-slate-700">
                      {entry.name} — {LEAVE_TYPE_LABELS[entry.type]}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
