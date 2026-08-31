import { notFound } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { updateEmployeeProfile } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/ui/form-select'

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('hr')
  const { id } = await params
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: user } = await admin.from('users').select('id, name, email, role, is_active').eq('id', id).single()

  if (!user) notFound()

  const { data: profile } = await admin
    .from('employee_profiles')
    .select(
      'phone, address, emergency_contact_name, emergency_contact_phone, date_of_birth, designation, department, employment_start_date, employment_type, manager_id'
    )
    .eq('user_id', id)
    .single()

  const { data: activeUsers } = await admin
    .from('users')
    .select('id, name, is_active')
    .eq('is_active', true)
    .neq('id', id)
    .order('name')

  // The employee's currently assigned manager must always appear as an
  // option, even if they've since been deactivated — otherwise the select
  // silently shows "No manager" and an unrelated form save would silently
  // null out the relationship. Label them as deactivated so HR sees the
  // true state instead. (The write path has its own defense-in-depth check
  // in updateEmployeeProfile.)
  let managerOptions = activeUsers ?? []
  if (profile?.manager_id && !managerOptions.some((user) => user.id === profile.manager_id)) {
    const { data: assignedManager } = await admin
      .from('users')
      .select('id, name, is_active')
      .eq('id', profile.manager_id)
      .single()
    if (assignedManager) {
      managerOptions = [...managerOptions, assignedManager]
    }
  }

  const employmentTypeOptions = [
    { value: 'full_time', label: 'Full time' },
    { value: 'part_time', label: 'Part time' },
    { value: 'contract', label: 'Contract' },
  ]

  const managerSelectOptions = [
    { value: '', label: 'No manager' },
    ...managerOptions.map((manager) => ({
      value: manager.id,
      label: manager.name + (!manager.is_active ? ' (deactivated)' : ''),
    })),
  ]

  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{user.name}</CardTitle>
          <p className="text-sm text-slate-500">
            {user.email} · {user.role} · {user.is_active ? 'Active' : 'Deactivated'}
          </p>
        </CardHeader>
      </Card>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <Card>
        <CardContent>
          <form action={updateEmployeeProfile} className="grid grid-cols-2 gap-6">
            <input type="hidden" name="userId" value={user.id} />

            <div className="space-y-2">
              <h2 className="text-sm font-medium text-slate-500">Job info</h2>
              <Input name="designation" placeholder="Designation" defaultValue={profile?.designation ?? ''} />
              <Input name="department" placeholder="Department" defaultValue={profile?.department ?? ''} />
              <Input
                name="employmentStartDate"
                type="date"
                defaultValue={profile?.employment_start_date ?? ''}
              />
              <FormSelect
                name="employmentType"
                options={employmentTypeOptions}
                defaultValue={profile?.employment_type ?? ''}
                placeholder="Select type"
                className="w-full"
              />
              <FormSelect
                name="managerId"
                options={managerSelectOptions}
                defaultValue={profile?.manager_id ?? ''}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-medium text-slate-500">Personal info</h2>
              <Input name="phone" placeholder="Phone" defaultValue={profile?.phone ?? ''} />
              <Input name="address" placeholder="Address" defaultValue={profile?.address ?? ''} />
              <Input
                name="emergencyContactName"
                placeholder="Emergency contact name"
                defaultValue={profile?.emergency_contact_name ?? ''}
              />
              <Input
                name="emergencyContactPhone"
                placeholder="Emergency contact phone"
                defaultValue={profile?.emergency_contact_phone ?? ''}
              />
              <Input name="dateOfBirth" type="date" defaultValue={profile?.date_of_birth ?? ''} />
            </div>

            <Button type="submit" className="col-span-2">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
