import { notFound } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { updateEmployeeProfile } from './actions'

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

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_0_rgba(30,41,59,0.06),0_2px_6px_-1px_rgba(30,41,59,0.08)]">
        <h1 className="text-lg font-semibold text-slate-800">{user.name}</h1>
        <p className="text-sm text-slate-500">
          {user.email} · {user.role} · {user.is_active ? 'Active' : 'Deactivated'}
        </p>
      </div>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <form
        action={updateEmployeeProfile}
        className="grid grid-cols-2 gap-6 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_0_rgba(30,41,59,0.06),0_2px_6px_-1px_rgba(30,41,59,0.08)]"
      >
        <input type="hidden" name="userId" value={user.id} />

        <div className="space-y-2">
          <h2 className="text-sm font-medium text-slate-500">Job info</h2>
          <input
            name="designation"
            placeholder="Designation"
            defaultValue={profile?.designation ?? ''}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          />
          <input
            name="department"
            placeholder="Department"
            defaultValue={profile?.department ?? ''}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          />
          <input
            name="employmentStartDate"
            type="date"
            defaultValue={profile?.employment_start_date ?? ''}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          />
          <select
            name="employmentType"
            defaultValue={profile?.employment_type ?? ''}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          >
            <option value="">Select type</option>
            <option value="full_time">Full time</option>
            <option value="part_time">Part time</option>
            <option value="contract">Contract</option>
          </select>
          <select
            name="managerId"
            defaultValue={profile?.manager_id ?? ''}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          >
            <option value="">No manager</option>
            {managerOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
                {!user.is_active ? ' (deactivated)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-medium text-slate-500">Personal info</h2>
          <input
            name="phone"
            placeholder="Phone"
            defaultValue={profile?.phone ?? ''}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          />
          <input
            name="address"
            placeholder="Address"
            defaultValue={profile?.address ?? ''}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          />
          <input
            name="emergencyContactName"
            placeholder="Emergency contact name"
            defaultValue={profile?.emergency_contact_name ?? ''}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          />
          <input
            name="emergencyContactPhone"
            placeholder="Emergency contact phone"
            defaultValue={profile?.emergency_contact_phone ?? ''}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          />
          <input
            name="dateOfBirth"
            type="date"
            defaultValue={profile?.date_of_birth ?? ''}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          />
        </div>

        <button
          type="submit"
          className="col-span-2 rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700 active:scale-[0.98] transition-transform"
        >
          Save
        </button>
      </form>
    </div>
  )
}
