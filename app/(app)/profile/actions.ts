'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { submitProfileChangesSchema } from '@/lib/validation'
import type { EmployeeProfileField } from '@/types/database'

export async function submitProfileChangeRequest(formData: FormData) {
  const currentUser = await requireUser()

  const parsed = submitProfileChangesSchema.safeParse({
    phone: formData.get('phone'),
    address: formData.get('address'),
    emergencyContactName: formData.get('emergencyContactName'),
    emergencyContactPhone: formData.get('emergencyContactPhone'),
    dateOfBirth: formData.get('dateOfBirth'),
  })

  if (!parsed.success) {
    redirect('/profile?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('employee_profiles')
    .select('phone, address, emergency_contact_name, emergency_contact_phone, date_of_birth')
    .eq('user_id', currentUser.id)
    .single()

  const { data: existingRequests } = await supabase
    .from('employee_profile_requests')
    .select('field')
    .eq('user_id', currentUser.id)
    .eq('status', 'pending')

  const pendingFields = new Set((existingRequests ?? []).map((request) => request.field))

  const candidates: { field: EmployeeProfileField; current: string | null; proposed: string }[] = [
    { field: 'phone', current: profile?.phone ?? null, proposed: parsed.data.phone ?? '' },
    { field: 'address', current: profile?.address ?? null, proposed: parsed.data.address ?? '' },
    {
      field: 'emergency_contact_name',
      current: profile?.emergency_contact_name ?? null,
      proposed: parsed.data.emergencyContactName ?? '',
    },
    {
      field: 'emergency_contact_phone',
      current: profile?.emergency_contact_phone ?? null,
      proposed: parsed.data.emergencyContactPhone ?? '',
    },
    { field: 'date_of_birth', current: profile?.date_of_birth ?? null, proposed: parsed.data.dateOfBirth ?? '' },
  ]

  const changedFields = candidates.filter(
    (candidate) => candidate.proposed !== '' && candidate.proposed !== (candidate.current ?? '')
  )

  const blockedField = changedFields.find((candidate) => pendingFields.has(candidate.field))
  if (blockedField) {
    redirect('/profile?error=' + encodeURIComponent(`You already have a pending request for ${blockedField.field}`))
  }

  if (changedFields.length === 0) {
    redirect('/profile')
  }

  const { error } = await supabase.from('employee_profile_requests').insert(
    changedFields.map((candidate) => ({
      user_id: currentUser.id,
      field: candidate.field,
      proposed_value: candidate.proposed,
    }))
  )

  if (error) {
    redirect('/profile?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/profile')
  redirect('/profile')
}
