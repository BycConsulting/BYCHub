import { requireAdmin } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { approveProfileRequest, rejectProfileRequest } from './actions'
import type { EmployeeProfileField } from '@/types/database'

function currentValueFor(
  profile:
    | {
        phone: string | null
        address: string | null
        emergency_contact_name: string | null
        emergency_contact_phone: string | null
        date_of_birth: string | null
      }
    | undefined,
  field: EmployeeProfileField
): string {
  if (!profile) return '—'
  switch (field) {
    case 'phone':
      return profile.phone ?? '—'
    case 'address':
      return profile.address ?? '—'
    case 'emergency_contact_name':
      return profile.emergency_contact_name ?? '—'
    case 'emergency_contact_phone':
      return profile.emergency_contact_phone ?? '—'
    case 'date_of_birth':
      return profile.date_of_birth ?? '—'
  }
}

export default async function ProfileRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireAdmin()
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: pendingRequests } = await admin
    .from('employee_profile_requests')
    .select('id, user_id, field, proposed_value, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  const pending = pendingRequests ?? []
  const userIds = [...new Set(pending.map((request) => request.user_id))]

  const { data: users } =
    userIds.length > 0 ? await admin.from('users').select('id, name').in('id', userIds) : { data: [] }
  const nameById = new Map((users ?? []).map((user) => [user.id, user.name]))

  const { data: profiles } =
    userIds.length > 0
      ? await admin
          .from('employee_profiles')
          .select('user_id, phone, address, emergency_contact_name, emergency_contact_phone, date_of_birth')
          .in('user_id', userIds)
      : { data: [] }
  const profileById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]))

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Pending profile change requests</h1>
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
      {pending.length === 0 ? (
        <p className="text-sm text-gray-500">No pending requests.</p>
      ) : (
        <ul className="space-y-3">
          {pending.map((request) => (
            <li key={request.id} className="rounded border p-4">
              <p className="text-sm font-medium">
                {nameById.get(request.user_id) ?? 'Unknown'} — {request.field}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                Current: {currentValueFor(profileById.get(request.user_id), request.field)} → Proposed:{' '}
                {request.proposed_value}
              </p>
              <div className="mt-2 flex gap-3">
                <form action={approveProfileRequest}>
                  <input type="hidden" name="requestId" value={request.id} />
                  <button type="submit" className="text-green-700 underline">
                    Approve
                  </button>
                </form>
                <form action={rejectProfileRequest}>
                  <input type="hidden" name="requestId" value={request.id} />
                  <button type="submit" className="text-red-600 underline">
                    Reject
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
