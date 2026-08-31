import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { updateHrConfig } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

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
        <Card>
          <CardContent>
            <form action={updateHrConfig} className="space-y-6">
              <div>
                <h2 className="text-sm font-medium text-slate-500">Working days</h2>
                <div className="mt-2 flex flex-wrap gap-4">
                  {WEEKDAYS.map((day) => (
                    <label key={day.key} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        name={day.key}
                        defaultChecked={config?.[day.column] ?? true}
                        className="h-4 w-4 accent-slate-800"
                      />
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
                    <Input
                      type="number"
                      name="casualLeaveDays"
                      min={0}
                      max={365}
                      required
                      defaultValue={config?.casual_leave_days ?? 12}
                      className="mt-1"
                    />
                  </label>
                  <label className="text-sm text-slate-700">
                    Sick Leave
                    <Input
                      type="number"
                      name="sickLeaveDays"
                      min={0}
                      max={365}
                      required
                      defaultValue={config?.sick_leave_days ?? 12}
                      className="mt-1"
                    />
                  </label>
                  <label className="text-sm text-slate-700">
                    Earned/Privilege Leave
                    <Input
                      type="number"
                      name="earnedLeaveDays"
                      min={0}
                      max={365}
                      required
                      defaultValue={config?.earned_leave_days ?? 15}
                      className="mt-1"
                    />
                  </label>
                  <label className="text-sm text-slate-700">
                    Maternity Leave
                    <Input
                      type="number"
                      name="maternityLeaveDays"
                      min={0}
                      max={365}
                      required
                      defaultValue={config?.maternity_leave_days ?? 182}
                      className="mt-1"
                    />
                  </label>
                  <label className="text-sm text-slate-700">
                    Paternity Leave
                    <Input
                      type="number"
                      name="paternityLeaveDays"
                      min={0}
                      max={365}
                      required
                      defaultValue={config?.paternity_leave_days ?? 15}
                      className="mt-1"
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
                <Textarea
                  name="officeIpAllowlist"
                  rows={2}
                  defaultValue={config?.office_ip_allowlist ?? ''}
                  className="mt-2"
                />
              </div>

              <Button type="submit">Save</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
