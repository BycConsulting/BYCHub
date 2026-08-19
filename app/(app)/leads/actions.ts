'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/access'
import { createLeadSchema, updateStageSchema, addActivitySchema } from '@/lib/validation'

export async function createLead(formData: FormData) {
  const user = await requireUser()

  const parsed = createLeadSchema.safeParse({
    contact_name: formData.get('contact_name'),
    contact_email: formData.get('contact_email'),
    contact_company: formData.get('contact_company'),
    source: formData.get('source'),
    notes: formData.get('notes'),
  })

  if (!parsed.success) {
    redirect('/leads?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const supabase = await createClient()
  const { error } = await supabase.from('leads').insert({
    contact_name: parsed.data.contact_name,
    contact_email: parsed.data.contact_email || null,
    contact_company: parsed.data.contact_company || null,
    source: parsed.data.source || null,
    notes: parsed.data.notes || null,
    assigned_user_id: user.id,
  })

  if (error) {
    redirect('/leads?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/leads')
  redirect('/leads')
}

export async function updateLeadStage(formData: FormData) {
  const user = await requireUser()

  const parsed = updateStageSchema.safeParse({
    leadId: formData.get('leadId'),
    stage: formData.get('stage'),
  })

  if (!parsed.success) {
    redirect(`/leads/${formData.get('leadId')}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const supabase = await createClient()
  const { leadId, stage } = parsed.data

  const { error: updateError } = await supabase
    .from('leads')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  if (updateError) {
    redirect(`/leads/${leadId}?error=` + encodeURIComponent(updateError.message))
  }

  await supabase.from('activities').insert({
    lead_id: leadId,
    user_id: user.id,
    type: 'stage_change',
    body: `Stage changed to ${stage}`,
  })

  if (stage === 'won') {
    await convertLeadToClient(leadId, supabase)
  }

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  redirect(`/leads/${leadId}`)
}

async function convertLeadToClient(leadId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: lead } = await supabase
    .from('leads')
    .select('id, client_id, contact_company, contact_name, assigned_user_id')
    .eq('id', leadId)
    .single()

  if (!lead || lead.client_id) return

  const { data: client } = await supabase
    .from('clients')
    .insert({
      name: lead.contact_company || lead.contact_name,
      status: 'active',
      owner_user_id: lead.assigned_user_id,
    })
    .select('id')
    .single()

  if (client) {
    await supabase.from('leads').update({ client_id: client.id }).eq('id', leadId)
  }
}

export async function addActivity(formData: FormData) {
  const user = await requireUser()

  const rawLeadId = formData.get('leadId')
  const rawClientId = formData.get('clientId')

  const parsed = addActivitySchema.safeParse({
    leadId: rawLeadId ? String(rawLeadId) : undefined,
    clientId: rawClientId ? String(rawClientId) : undefined,
    type: formData.get('type'),
    body: formData.get('body'),
  })

  const returnPath = rawLeadId ? `/leads/${rawLeadId}` : `/clients/${rawClientId}`

  if (!parsed.success) {
    redirect(`${returnPath}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const supabase = await createClient()
  const { error } = await supabase.from('activities').insert({
    lead_id: parsed.data.leadId ?? null,
    client_id: parsed.data.clientId ?? null,
    user_id: user.id,
    type: parsed.data.type,
    body: parsed.data.body,
  })

  if (error) {
    redirect(`${returnPath}?error=` + encodeURIComponent(error.message))
  }

  revalidatePath(returnPath)
  redirect(returnPath)
}
