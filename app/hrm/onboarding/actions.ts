'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { startOnboardingSchema, updateOnboardingChecklistSchema, completeOnboardingSchema } from '@/lib/validation'

export async function startOnboarding(formData: FormData) {
  const currentUser = await requireModule('onboarding')

  const parsed = startOnboardingSchema.safeParse({ userId: formData.get('userId') })

  if (!parsed.success) {
    redirect('/hrm/onboarding?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: created, error } = await admin
    .from('onboarding_checklists')
    .insert({ user_id: parsed.data.userId, started_by: currentUser.id })
    .select('id')
    .single()

  if (!created) {
    redirect('/hrm/onboarding?error=' + encodeURIComponent(error?.message ?? 'Could not start onboarding'))
  }

  revalidatePath('/hrm/onboarding')
  redirect(`/hrm/onboarding/${created.id}`)
}

export async function updateOnboardingChecklist(formData: FormData) {
  await requireModule('onboarding')

  const checklistIdRaw = String(formData.get('checklistId') ?? '')

  const parsed = updateOnboardingChecklistSchema.safeParse({
    checklistId: formData.get('checklistId'),
    stepOfferLetterSigned: formData.get('stepOfferLetterSigned') === 'on',
    stepIdProofCollected: formData.get('stepIdProofCollected') === 'on',
    stepEquipmentAssigned: formData.get('stepEquipmentAssigned') === 'on',
    stepAccountsProvisioned: formData.get('stepAccountsProvisioned') === 'on',
    stepOrientationCompleted: formData.get('stepOrientationCompleted') === 'on',
    stepDocumentsFiled: formData.get('stepDocumentsFiled') === 'on',
    notes: formData.get('notes'),
  })

  if (!parsed.success) {
    redirect(`/hrm/onboarding/${checklistIdRaw}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from('onboarding_checklists')
    .update({
      step_offer_letter_signed: parsed.data.stepOfferLetterSigned,
      step_id_proof_collected: parsed.data.stepIdProofCollected,
      step_equipment_assigned: parsed.data.stepEquipmentAssigned,
      step_accounts_provisioned: parsed.data.stepAccountsProvisioned,
      step_orientation_completed: parsed.data.stepOrientationCompleted,
      step_documents_filed: parsed.data.stepDocumentsFiled,
      notes: parsed.data.notes || '',
    })
    .eq('id', parsed.data.checklistId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Checklist not found' : error.message
    redirect(`/hrm/onboarding/${parsed.data.checklistId}?error=` + encodeURIComponent(message))
  }

  revalidatePath(`/hrm/onboarding/${parsed.data.checklistId}`)
  redirect(`/hrm/onboarding/${parsed.data.checklistId}`)
}

export async function completeOnboarding(formData: FormData) {
  await requireModule('onboarding')

  const parsed = completeOnboardingSchema.safeParse({ checklistId: formData.get('checklistId') })

  if (!parsed.success) {
    redirect('/hrm/onboarding?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from('onboarding_checklists')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', parsed.data.checklistId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Checklist not found' : error.message
    redirect(`/hrm/onboarding/${parsed.data.checklistId}?error=` + encodeURIComponent(message))
  }

  revalidatePath('/hrm/onboarding')
  revalidatePath(`/hrm/onboarding/${parsed.data.checklistId}`)
  redirect(`/hrm/onboarding/${parsed.data.checklistId}`)
}
