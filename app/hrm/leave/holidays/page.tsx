import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { addHoliday, deleteHoliday } from './actions'

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await requireModule('leave_attendance')
  const { error } = await searchParams
  const canManage = currentUser.role === 'hr' || currentUser.role === 'admin'

  const admin = createAdminSupabaseClient()
  const { data: holidays, error: holidaysError } = await admin
    .from('holidays')
    .select('id, date, name')
    .order('date', { ascending: true })

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/hrm/leave" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to Leave
      </Link>
      <h1 className="text-xl font-semibold text-slate-800">Company holidays</h1>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      {canManage && (
        <form
          action={addHoliday}
          className="flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <label className="text-sm text-slate-700">
            Date
            <input
              type="date"
              name="date"
              required
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
            />
          </label>
          <label className="flex-1 text-sm text-slate-700">
            Name
            <input
              name="name"
              placeholder="e.g. Independence Day"
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Add
          </button>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {holidaysError ? (
          <p className="p-4 text-sm text-red-700">Could not load holidays</p>
        ) : holidays && holidays.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {holidays.map((holiday) => (
              <li key={holiday.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-slate-700">
                  {holiday.date} — {holiday.name}
                </span>
                {canManage && (
                  <form action={deleteHoliday}>
                    <input type="hidden" name="holidayId" value={holiday.id} />
                    <button type="submit" className="text-red-600 underline">
                      Delete
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-sm text-slate-500">No holidays added yet.</p>
        )}
      </div>
    </div>
  )
}
