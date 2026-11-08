'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { addCandidateSchema } from '@/lib/validation'

export async function addCandidate(formData: FormData) {
  await requireModule('recruitment')

  const openingIdRaw = String(formData.get('openingId') ?? '')

  const parsed = addCandidateSchema.safeParse({
    openingId: formData.get('openingId'),
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    resumeNotes: formData.get('resumeNotes'),
  })

  if (!parsed.success) {
    redirect(`/hrm/recruitment/${openingIdRaw}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: created, error } = await admin
    .from('candidates')
    .insert({
      opening_id: parsed.data.openingId,
      name: parsed.data.name,
      email: parsed.data.email || '',
      phone: parsed.data.phone || '',
      resume_notes: parsed.data.resumeNotes || '',
    })
    .select('id')
    .single()

  if (!created) {
    redirect(
      `/hrm/recruitment/${parsed.data.openingId}?error=` +
        encodeURIComponent(error?.message ?? 'Could not add candidate')
    )
  }

  revalidatePath(`/hrm/recruitment/${parsed.data.openingId}`)
  redirect(`/hrm/recruitment/${parsed.data.openingId}`)
}
