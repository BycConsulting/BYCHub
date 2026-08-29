import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createShift, assignShift } from './actions'

const WEEKDAYS = [
  { key: 'workingMonday', label: 'Mon' },
  { key: 'workingTuesday', label: 'Tue' },
  { key: 'workingWednesday', label: 'Wed' },
  { key: 'workingThursday', label: 'Thu' },
  { key: 'workingFriday', label: 'Fri' },
  { key: 'workingSaturday', label: 'Sat' },
] as const

export default async function ShiftsPage({
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
  const { data: shifts, error: shiftsError } = await admin
    .from('shifts')
    .select('id, name, start_time, end_time')
    .order('name')

  const { data: employees, error: employeesError } = await admin
    .from('users')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  const { data: profiles } = await admin.from('employee_profiles').select('user_id, shift_id')
  const shiftIdByUser = new Map((profiles ?? []).map((p) => [p.user_id, p.shift_id]))

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/hrm/attendance" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to Attendance
      </Link>
      <h1 className="text-xl font-semibold text-slate-800">Shifts</h1>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <form
        action={createShift}
        className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <input
          name="name"
          placeholder="Shift name"
          required
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
        />
        <div className="flex gap-3">
          <input
            type="time"
            name="startTime"
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
          <input
            type="time"
            name="endTime"
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
        </div>
        <div className="col-span-2 flex flex-wrap gap-4">
          {WEEKDAYS.map((day) => (
            <label key={day.key} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name={day.key} defaultChecked />
              {day.label}
            </label>
          ))}
        </div>
        <button
          type="submit"
          className="col-span-2 rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Create shift
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="px-4 pt-4 text-lg font-semibold text-slate-800">Existing shifts</h2>
        {shiftsError ? (
          <p className="p-4 text-sm text-red-700">Could not load shifts</p>
        ) : shifts && shifts.length > 0 ? (
          <ul className="mt-2 divide-y divide-slate-100">
            {shifts.map((shift) => (
              <li key={shift.id} className="px-4 py-3 text-sm text-slate-700">
                {shift.name} — {shift.start_time} to {shift.end_time}
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-sm text-slate-500">No shifts created yet.</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="px-4 pt-4 text-lg font-semibold text-slate-800">Assign employees</h2>
        {employeesError ? (
          <p className="p-4 text-sm text-red-700">Could not load employees</p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <tbody>
              {(employees ?? []).map((employee) => (
                <tr key={employee.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-700">{employee.name}</td>
                  <td className="px-4 py-2">
                    <form action={assignShift} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={employee.id} />
                      <select
                        name="shiftId"
                        defaultValue={shiftIdByUser.get(employee.id) ?? ''}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                      >
                        <option value="">No shift</option>
                        {(shifts ?? []).map((shift) => (
                          <option key={shift.id} value={shift.id}>
                            {shift.name}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="text-slate-600 underline hover:text-slate-900">
                        Save
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
