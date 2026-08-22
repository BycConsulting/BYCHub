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
  const { data: config } = await admin.from('hr_config').select('*').eq('id', true).single()

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">HR configuration</h1>
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      <form action={updateHrConfig} className="space-y-6">
        <div>
          <h2 className="text-sm font-medium text-gray-500">Working days</h2>
          <div className="mt-2 flex flex-wrap gap-4">
            {WEEKDAYS.map((day) => (
              <label key={day.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={day.key} defaultChecked={config?.[day.column] ?? true} />
                {day.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium text-gray-500">Annual leave allocation (days)</h2>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="text-sm">
              Casual Leave
              <input
                type="number"
                name="casualLeaveDays"
                min={0}
                max={365}
                defaultValue={config?.casual_leave_days ?? 12}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Sick Leave
              <input
                type="number"
                name="sickLeaveDays"
                min={0}
                max={365}
                defaultValue={config?.sick_leave_days ?? 12}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Earned/Privilege Leave
              <input
                type="number"
                name="earnedLeaveDays"
                min={0}
                max={365}
                defaultValue={config?.earned_leave_days ?? 15}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Maternity Leave
              <input
                type="number"
                name="maternityLeaveDays"
                min={0}
                max={365}
                defaultValue={config?.maternity_leave_days ?? 182}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Paternity Leave
              <input
                type="number"
                name="paternityLeaveDays"
                min={0}
                max={365}
                defaultValue={config?.paternity_leave_days ?? 15}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </label>
          </div>
        </div>

        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Save
        </button>
      </form>
    </div>
  )
}
