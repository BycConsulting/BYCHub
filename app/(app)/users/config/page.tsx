import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { updateHrConfig } from './actions'

const WEEKDAYS = [
  { key: 'workingMonday', column: 'working_monday', label: 'Monday' },
  { key: 'workingTuesday', column: 'working_tuesday', label: 'Tuesday' },
  { key: 'workingWednesday', column: 'working_wednesday', label: 'Wednesday' },
  { key: 'workingThursday', column: 'working_thursday', label: 'Thursday' },
  { key: 'workingFriday', column: 'working_friday', label: 'Friday' },
  { key: 'workingSaturday', column: 'working_saturday', label: 'Saturday' },
] as const

export default async function HrConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('hr')
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()
  const { data: config, error: readError } = await admin.from('hr_config').select('*').eq('id', true).single()

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/users" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to HR
      </Link>
      <h1 className="text-xl font-semibold text-slate-800">HR configuration</h1>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}
      {readError && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          Could not load HR configuration — has the 0008_hr_config migration been run?
        </p>
      )}

      {config && (
        <form action={updateHrConfig} className="space-y-6 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_0_rgba(30,41,59,0.06),0_2px_6px_-1px_rgba(30,41,59,0.08)]">
          <div>
            <h2 className="text-sm font-medium text-slate-500">Working days</h2>
            <div className="mt-2 flex flex-wrap gap-4">
              {WEEKDAYS.map((day) => (
                <label key={day.key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name={day.key} defaultChecked={config?.[day.column] ?? true} />
                  {day.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-medium text-slate-500">Annual leave allocation (days)</h2>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="text-sm text-slate-700">
                Casual Leave
                <input
                  type="number"
                  name="casualLeaveDays"
                  min={0}
                  max={365}
                  required
                  defaultValue={config?.casual_leave_days ?? 12}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
                />
              </label>
              <label className="text-sm text-slate-700">
                Sick Leave
                <input
                  type="number"
                  name="sickLeaveDays"
                  min={0}
                  max={365}
                  required
                  defaultValue={config?.sick_leave_days ?? 12}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
                />
              </label>
              <label className="text-sm text-slate-700">
                Earned/Privilege Leave
                <input
                  type="number"
                  name="earnedLeaveDays"
                  min={0}
                  max={365}
                  required
                  defaultValue={config?.earned_leave_days ?? 15}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
                />
              </label>
              <label className="text-sm text-slate-700">
                Maternity Leave
                <input
                  type="number"
                  name="maternityLeaveDays"
                  min={0}
                  max={365}
                  required
                  defaultValue={config?.maternity_leave_days ?? 182}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
                />
              </label>
              <label className="text-sm text-slate-700">
                Paternity Leave
                <input
                  type="number"
                  name="paternityLeaveDays"
                  min={0}
                  max={365}
                  required
                  defaultValue={config?.paternity_leave_days ?? 15}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
                />
              </label>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-medium text-slate-500">Office network (attendance check-in)</h2>
            <p className="mt-1 text-xs text-slate-400">
              Comma-separated IPv4 addresses or CIDR ranges (e.g. 203.0.113.5, 198.51.100.0/24). Employees can
              only check in/out from these networks unless they have an approved WFH request for today.
            </p>
            <textarea
              name="officeIpAllowlist"
              rows={2}
              defaultValue={config?.office_ip_allowlist ?? ''}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
            />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 active:scale-[0.98] transition-transform"
          >
            Save
          </button>
        </form>
      )}
    </div>
  )
}
