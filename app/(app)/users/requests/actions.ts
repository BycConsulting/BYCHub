'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { reviewProfileRequestSchema } from '@/lib/validation'
import type { Database, EmployeeProfileField } from '@/types/database'

function buildProfileUpdate(
  field: EmployeeProfileField,
  value: string
): Database['public']['Tables']['employee_profiles']['Update'] {
  switch (field) {
    case 'phone':
      return { phone: value }
    case 'address':
      return { address: value }
    case 'emergency_contact_name':
      return { emergency_contact_name: value }
    case 'emergency_contact_phone':
      return { emergency_contact_phone: value }
    case 'date_of_birth':
      return { date_of_birth: value }
  }
}

export async function approveProfileRequest(formData: FormData) {
  const currentUser = await requireAdmin()

  const parsed = reviewProfileRequestSchema.safeParse({ requestId: formData.get('requestId') })

  if (!parsed.success) {
    redirect('/users/requests?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()

  const { data: request } = await admin
    .from('employee_profile_requests')
    .select('id, user_id, field, status, proposed_value')
    .eq('id', parsed.data.requestId)
    .single()

  if (!request || request.status !== 'pending') {
    redirect('/users/requests?error=' + encodeURIComponent('Request not found or already resolved'))
  }

  const { data: updatedProfile, error: profileError } = await admin
    .from('employee_profiles')
    .update({
      ...buildProfileUpdate(request.field, request.proposed_value),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', request.user_id)
    .select('user_id')
    .single()

  // A well-formed but nonexistent user id matches zero rows, which without
  // `.single()` returns no error at all — falling through and marking the
  // request approved even though the value was never applied, and the
  // request can never be re-approved because it's no longer pending.
  if (!updatedProfile) {
    const message =
      !profileError || profileError.code === 'PGRST116' ? 'Employee profile not found' : profileError.message
    redirect('/users/requests?error=' + encodeURIComponent(message))
  }

  const { error: requestError } = await admin
    .from('employee_profile_requests')
    .update({ status: 'approved', reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
    .eq('id', request.id)

  if (requestError) {
    redirect('/users/requests?error=' + encodeURIComponent(requestError.message))
  }

  revalidatePath('/users/requests')
  redirect('/users/requests')
}

export async function rejectProfileRequest(formData: FormData) {
  const currentUser = await requireAdmin()

  const parsed = reviewProfileRequestSchema.safeParse({ requestId: formData.get('requestId') })

  if (!parsed.success) {
    redirect('/users/requests?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()

  const { data: request } = await admin
    .from('employee_profile_requests')
    .select('id, status')
    .eq('id', parsed.data.requestId)
    .single()

  if (!request || request.status !== 'pending') {
    redirect('/users/requests?error=' + encodeURIComponent('Request not found or already resolved'))
  }

  const { error } = await admin
    .from('employee_profile_requests')
    .update({ status: 'rejected', reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
    .eq('id', request.id)

  if (error) {
    redirect('/users/requests?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/users/requests')
  redirect('/users/requests')
}
