'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import {
  startOffboardingSchema,
  updateOffboardingChecklistSchema,
  completeOffboardingSchema,
} from '@/lib/validation'

export async function startOffboarding(formData: FormData) {
  const currentUser = await requireModule('offboarding')

  const parsed = startOffboardingSchema.safeParse({ userId: formData.get('userId') })

  if (!parsed.success) {
    redirect('/hrm/offboarding?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: created, error } = await admin
    .from('offboarding_checklists')
    .insert({ user_id: parsed.data.userId, started_by: currentUser.id })
    .select('id')
    .single()

  if (!created) {
    redirect('/hrm/offboarding?error=' + encodeURIComponent(error?.message ?? 'Could not start offboarding'))
  }

  revalidatePath('/hrm/offboarding')
  redirect(`/hrm/offboarding/${created.id}`)
}

export async function updateOffboardingChecklist(formData: FormData) {
  await requireModule('offboarding')

  const checklistIdRaw = String(formData.get('checklistId') ?? '')

  const parsed = updateOffboardingChecklistSchema.safeParse({
    checklistId: formData.get('checklistId'),
    stepResignationRecorded: formData.get('stepResignationRecorded') === 'on',
    stepExitInterviewDone: formData.get('stepExitInterviewDone') === 'on',
    stepAssetsReturned: formData.get('stepAssetsReturned') === 'on',
    stepAccountsDeprovisioned: formData.get('stepAccountsDeprovisioned') === 'on',
    stepFinalSettlementDone: formData.get('stepFinalSettlementDone') === 'on',
    notes: formData.get('notes'),
  })

  if (!parsed.success) {
    redirect(`/hrm/offboarding/${checklistIdRaw}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from('offboarding_checklists')
    .update({
      step_resignation_recorded: parsed.data.stepResignationRecorded,
      step_exit_interview_done: parsed.data.stepExitInterviewDone,
      step_assets_returned: parsed.data.stepAssetsReturned,
      step_accounts_deprovisioned: parsed.data.stepAccountsDeprovisioned,
      step_final_settlement_done: parsed.data.stepFinalSettlementDone,
      notes: parsed.data.notes || '',
    })
    .eq('id', parsed.data.checklistId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Checklist not found' : error.message
    redirect(`/hrm/offboarding/${parsed.data.checklistId}?error=` + encodeURIComponent(message))
  }

  revalidatePath(`/hrm/offboarding/${parsed.data.checklistId}`)
  redirect(`/hrm/offboarding/${parsed.data.checklistId}`)
}

export async function completeOffboarding(formData: FormData) {
  await requireModule('offboarding')

  const parsed = completeOffboardingSchema.safeParse({ checklistId: formData.get('checklistId') })

  if (!parsed.success) {
    redirect('/hrm/offboarding?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from('offboarding_checklists')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', parsed.data.checklistId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Checklist not found' : error.message
    redirect(`/hrm/offboarding/${parsed.data.checklistId}?error=` + encodeURIComponent(message))
  }

  revalidatePath('/hrm/offboarding')
  revalidatePath(`/hrm/offboarding/${parsed.data.checklistId}`)
  redirect(`/hrm/offboarding/${parsed.data.checklistId}`)
}
