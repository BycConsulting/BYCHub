import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { submitProfileChangeRequest } from './actions'

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await requireUser()
  const { error } = await searchParams

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('employee_profiles')
    .select(
      'phone, address, emergency_contact_name, emergency_contact_phone, date_of_birth, designation, department, employment_start_date, employment_type'
    )
    .eq('user_id', currentUser.id)
    .single()

  const { data: requests } = await supabase
    .from('employee_profile_requests')
    .select('id, field, proposed_value, status, created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">My profile</h1>
        {error && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="mt-3">
          <h2 className="text-sm font-medium text-gray-500">Job info (set by admin)</h2>
          <p className="mt-1 text-sm">Designation: {profile?.designation ?? '—'}</p>
          <p className="text-sm">Department: {profile?.department ?? '—'}</p>
          <p className="text-sm">Start date: {profile?.employment_start_date ?? '—'}</p>
          <p className="text-sm">Employment type: {profile?.employment_type ?? '—'}</p>
        </div>

        <form action={submitProfileChangeRequest} className="mt-4 space-y-2">
          <h2 className="text-sm font-medium text-gray-500">Personal info (changes need admin approval)</h2>
          <input
            name="phone"
            placeholder="Phone"
            defaultValue={profile?.phone ?? ''}
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="address"
            placeholder="Address"
            defaultValue={profile?.address ?? ''}
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="emergencyContactName"
            placeholder="Emergency contact name"
            defaultValue={profile?.emergency_contact_name ?? ''}
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="emergencyContactPhone"
            placeholder="Emergency contact phone"
            defaultValue={profile?.emergency_contact_phone ?? ''}
            className="w-full rounded border px-3 py-2"
          />
          <input
            name="dateOfBirth"
            type="date"
            defaultValue={profile?.date_of_birth ?? ''}
            className="w-full rounded border px-3 py-2"
          />
          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Submit changes for approval
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-lg font-semibold">My requests</h2>
        {requests && requests.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {requests.map((request) => (
              <li key={request.id} className="rounded border p-3 text-sm">
                {request.field}: {request.proposed_value} — <strong>{request.status}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-gray-500">No requests yet.</p>
        )}
      </div>
    </div>
  )
}
