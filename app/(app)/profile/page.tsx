import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'

export default async function ProfilePage() {
  const currentUser = await requireUser()

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('employee_profiles')
    .select(
      'phone, address, emergency_contact_name, emergency_contact_phone, date_of_birth, designation, department, employment_start_date, employment_type'
    )
    .eq('user_id', currentUser.id)
    .single()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">My profile</h1>

        <div className="mt-3">
          <h2 className="text-sm font-medium text-gray-500">Job info</h2>
          <p className="mt-1 text-sm">Designation: {profile?.designation ?? '—'}</p>
          <p className="text-sm">Department: {profile?.department ?? '—'}</p>
          <p className="text-sm">Start date: {profile?.employment_start_date ?? '—'}</p>
          <p className="text-sm">Employment type: {profile?.employment_type ?? '—'}</p>
        </div>

        <div className="mt-4">
          <h2 className="text-sm font-medium text-gray-500">Personal info</h2>
          <p className="mt-1 text-sm">Phone: {profile?.phone ?? '—'}</p>
          <p className="text-sm">Address: {profile?.address ?? '—'}</p>
          <p className="text-sm">Emergency contact name: {profile?.emergency_contact_name ?? '—'}</p>
          <p className="text-sm">Emergency contact phone: {profile?.emergency_contact_phone ?? '—'}</p>
          <p className="text-sm">Date of birth: {profile?.date_of_birth ?? '—'}</p>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          To update any of this information, contact HR or an admin.
        </p>
      </div>
    </div>
  )
}
