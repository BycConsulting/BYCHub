'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { updateEmployeeProfileSchema } from '@/lib/validation'

export async function updateEmployeeProfile(formData: FormData) {
  await requireAdmin()

  const parsed = updateEmployeeProfileSchema.safeParse({
    userId: formData.get('userId'),
    phone: formData.get('phone'),
    address: formData.get('address'),
    emergencyContactName: formData.get('emergencyContactName'),
    emergencyContactPhone: formData.get('emergencyContactPhone'),
    dateOfBirth: formData.get('dateOfBirth'),
    designation: formData.get('designation'),
    department: formData.get('department'),
    employmentStartDate: formData.get('employmentStartDate'),
    employmentType: formData.get('employmentType'),
  })

  if (!parsed.success) {
    redirect(`/users/${formData.get('userId')}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const { userId, ...fields } = parsed.data
  const admin = createAdminSupabaseClient()

  const { error } = await admin
    .from('employee_profiles')
    .update({
      phone: fields.phone || null,
      address: fields.address || null,
      emergency_contact_name: fields.emergencyContactName || null,
      emergency_contact_phone: fields.emergencyContactPhone || null,
      date_of_birth: fields.dateOfBirth || null,
      designation: fields.designation || null,
      department: fields.department || null,
      employment_start_date: fields.employmentStartDate || null,
      employment_type: fields.employmentType || null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (error) {
    redirect(`/users/${userId}?error=` + encodeURIComponent(error.message))
  }

  revalidatePath(`/users/${userId}`)
  redirect(`/users/${userId}`)
}
