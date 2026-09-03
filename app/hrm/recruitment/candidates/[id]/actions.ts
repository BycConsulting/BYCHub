'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { updateCandidateStageSchema, rejectCandidateSchema, updateCandidateNotesSchema } from '@/lib/validation'

export async function updateCandidateStage(formData: FormData) {
  await requireModule('recruitment')

  const candidateIdRaw = String(formData.get('candidateId') ?? '')

  const parsed = updateCandidateStageSchema.safeParse({
    candidateId: formData.get('candidateId'),
    stage: formData.get('stage'),
  })

  if (!parsed.success) {
    redirect(
      `/hrm/recruitment/candidates/${candidateIdRaw}?error=` + encodeURIComponent(parsed.error.issues[0].message)
    )
  }

  const admin = createAdminSupabaseClient()

  // Terminal states must not be reachable again: without this, a "hired"
  // candidate could be silently moved back to "applied" (or any stage) with
  // no error and no trace, since the schema itself only restricts which
  // values are legal, not which transitions are.
  const { data: existing } = await admin.from('candidates').select('stage').eq('id', parsed.data.candidateId).single()
  if (existing?.stage === 'hired' || existing?.stage === 'rejected') {
    redirect(
      `/hrm/recruitment/candidates/${parsed.data.candidateId}?error=` +
        encodeURIComponent(`Candidate is already ${existing.stage} and cannot be moved`)
    )
  }

  const { data: updated, error } = await admin
    .from('candidates')
    .update({ stage: parsed.data.stage, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.candidateId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Candidate not found' : error.message
    redirect(`/hrm/recruitment/candidates/${parsed.data.candidateId}?error=` + encodeURIComponent(message))
  }

  revalidatePath(`/hrm/recruitment/candidates/${parsed.data.candidateId}`)
  redirect(`/hrm/recruitment/candidates/${parsed.data.candidateId}`)
}

export async function rejectCandidate(formData: FormData) {
  await requireModule('recruitment')

  const parsed = rejectCandidateSchema.safeParse({ candidateId: formData.get('candidateId') })

  if (!parsed.success) {
    redirect('/hrm/recruitment?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()

  const { data: existing } = await admin.from('candidates').select('stage').eq('id', parsed.data.candidateId).single()
  if (existing?.stage === 'hired') {
    redirect(
      `/hrm/recruitment/candidates/${parsed.data.candidateId}?error=` +
        encodeURIComponent('Candidate is already hired and cannot be rejected')
    )
  }

  const { data: updated, error } = await admin
    .from('candidates')
    .update({ stage: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', parsed.data.candidateId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Candidate not found' : error.message
    redirect(`/hrm/recruitment/candidates/${parsed.data.candidateId}?error=` + encodeURIComponent(message))
  }

  revalidatePath(`/hrm/recruitment/candidates/${parsed.data.candidateId}`)
  redirect(`/hrm/recruitment/candidates/${parsed.data.candidateId}`)
}

export async function updateCandidateNotes(formData: FormData) {
  await requireModule('recruitment')

  const candidateIdRaw = String(formData.get('candidateId') ?? '')

  const parsed = updateCandidateNotesSchema.safeParse({
    candidateId: formData.get('candidateId'),
    notes: formData.get('notes'),
  })

  if (!parsed.success) {
    redirect(
      `/hrm/recruitment/candidates/${candidateIdRaw}?error=` + encodeURIComponent(parsed.error.issues[0].message)
    )
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from('candidates')
    .update({ notes: parsed.data.notes || '', updated_at: new Date().toISOString() })
    .eq('id', parsed.data.candidateId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Candidate not found' : error.message
    redirect(`/hrm/recruitment/candidates/${parsed.data.candidateId}?error=` + encodeURIComponent(message))
  }

  revalidatePath(`/hrm/recruitment/candidates/${parsed.data.candidateId}`)
  redirect(`/hrm/recruitment/candidates/${parsed.data.candidateId}`)
}
