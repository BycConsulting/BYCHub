'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createOpeningSchema, toggleOpeningStatusSchema } from '@/lib/validation'

export async function createOpening(formData: FormData) {
  const currentUser = await requireModule('recruitment')

  const parsed = createOpeningSchema.safeParse({
    title: formData.get('title'),
    department: formData.get('department'),
  })

  if (!parsed.success) {
    redirect('/hrm/recruitment?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: created, error } = await admin
    .from('job_openings')
    .insert({ title: parsed.data.title, department: parsed.data.department || '', created_by: currentUser.id })
    .select('id')
    .single()

  if (!created) {
    redirect('/hrm/recruitment?error=' + encodeURIComponent(error?.message ?? 'Could not create opening'))
  }

  revalidatePath('/hrm/recruitment')
  redirect(`/hrm/recruitment/${created.id}`)
}

export async function toggleOpeningStatus(formData: FormData) {
  await requireModule('recruitment')

  const parsed = toggleOpeningStatusSchema.safeParse({
    openingId: formData.get('openingId'),
    status: formData.get('status'),
  })

  if (!parsed.success) {
    redirect('/hrm/recruitment?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from('job_openings')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.openingId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Opening not found' : error.message
    redirect('/hrm/recruitment?error=' + encodeURIComponent(message))
  }

  revalidatePath('/hrm/recruitment')
  redirect('/hrm/recruitment')
}
