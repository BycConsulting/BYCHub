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
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">My profile</h1>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_0_rgba(30,41,59,0.06),0_2px_6px_-1px_rgba(30,41,59,0.08)]">
        <h2 className="text-sm font-medium text-slate-500">Job info</h2>
        <div className="mt-2 space-y-1 text-sm text-slate-700">
          <p>Designation: {profile?.designation ?? '—'}</p>
          <p>Department: {profile?.department ?? '—'}</p>
          <p>Start date: {profile?.employment_start_date ?? '—'}</p>
          <p>Employment type: {profile?.employment_type ?? '—'}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_0_rgba(30,41,59,0.06),0_2px_6px_-1px_rgba(30,41,59,0.08)]">
        <h2 className="text-sm font-medium text-slate-500">Personal info</h2>
        <div className="mt-2 space-y-1 text-sm text-slate-700">
          <p>Phone: {profile?.phone ?? '—'}</p>
          <p>Address: {profile?.address ?? '—'}</p>
          <p>Emergency contact name: {profile?.emergency_contact_name ?? '—'}</p>
          <p>Emergency contact phone: {profile?.emergency_contact_phone ?? '—'}</p>
          <p>Date of birth: {profile?.date_of_birth ?? '—'}</p>
        </div>
      </div>

      <p className="text-xs text-slate-400">To update any of this information, contact HR or an admin.</p>
    </div>
  )
}
