import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createShift, assignShift } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormSelect } from '@/components/ui/form-select'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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

  const shiftOptions = [
    { value: '', label: 'No shift' },
    ...(shifts ?? []).map((shift) => ({ value: shift.id, label: shift.name })),
  ]

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/hrm/attendance" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to Attendance
      </Link>
      <h1 className="text-xl font-semibold text-slate-800">Shifts</h1>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <Card>
        <CardContent>
          <form action={createShift} className="grid grid-cols-2 gap-3">
            <Input name="name" placeholder="Shift name" required />
            <div className="flex gap-3">
              <Input type="time" name="startTime" required className="w-full" />
              <Input type="time" name="endTime" required className="w-full" />
            </div>
            <div className="col-span-2 flex flex-wrap gap-4">
              {WEEKDAYS.map((day) => (
                <label key={day.key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name={day.key} defaultChecked className="h-4 w-4 accent-slate-800" />
                  {day.label}
                </label>
              ))}
            </div>
            <Button type="submit" className="col-span-2">
              Create shift
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardHeader className="pt-4">
          <CardTitle className="text-lg">Existing shifts</CardTitle>
        </CardHeader>
        {shiftsError ? (
          <CardContent className="pb-4">
            <p className="text-sm text-red-700">Could not load shifts</p>
          </CardContent>
        ) : shifts && shifts.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell className="font-medium text-slate-800">{shift.name}</TableCell>
                  <TableCell className="text-slate-600">{shift.start_time}</TableCell>
                  <TableCell className="text-slate-600">{shift.end_time}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardContent className="pb-4">
            <p className="text-sm text-slate-500">No shifts created yet.</p>
          </CardContent>
        )}
      </Card>

      <Card className="py-0">
        <CardHeader className="pt-4">
          <CardTitle className="text-lg">Assign employees</CardTitle>
        </CardHeader>
        {employeesError ? (
          <CardContent className="pb-4">
            <p className="text-sm text-red-700">Could not load employees</p>
          </CardContent>
        ) : (
          <Table>
            <TableBody>
              {(employees ?? []).map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="text-slate-700">{employee.name}</TableCell>
                  <TableCell>
                    <form action={assignShift} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={employee.id} />
                      <FormSelect
                        name="shiftId"
                        options={shiftOptions}
                        defaultValue={shiftIdByUser.get(employee.id) ?? ''}
                        className="h-8"
                      />
                      <button type="submit" className="text-slate-600 underline hover:text-slate-900">
                        Save
                      </button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
