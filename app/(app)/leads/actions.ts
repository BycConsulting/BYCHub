'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireModule } from '@/lib/access'
import { createLeadSchema, updateStageSchema, addActivitySchema } from '@/lib/validation'
import { stageChangeBody } from '@/lib/metrics'

export async function createLead(formData: FormData) {
  const user = await requireModule('leads')

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
  const user = await requireModule('leads')

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
    body: stageChangeBody(stage),
  })

  if (stage === 'won') {
    // The stage change and its activity entry stand either way, but a failed
    // conversion must not look like a success — surface it.
    const conversionError = await convertLeadToClient(leadId, supabase)
    if (conversionError) {
      revalidatePath(`/leads/${leadId}`)
      revalidatePath('/leads')
      redirect(
        `/leads/${leadId}?error=` +
          encodeURIComponent(`Stage saved, but creating the client record failed: ${conversionError}`)
      )
    }
  }

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  redirect(`/leads/${leadId}`)
}

/** Returns an error message if the conversion failed, or null on success/no-op. */
async function convertLeadToClient(
  leadId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, client_id, contact_company, contact_name, assigned_user_id')
    .eq('id', leadId)
    .single()

  if (leadError) return leadError.message
  if (!lead) return 'Lead not found'
  if (lead.client_id) return null

  const { data: client, error: insertError } = await supabase
    .from('clients')
    .insert({
      name: lead.contact_company || lead.contact_name,
      status: 'active',
      owner_user_id: lead.assigned_user_id,
    })
    .select('id')
    .single()

  if (insertError) return insertError.message
  if (!client) return 'Client record was not created'

  const { error: linkError } = await supabase
    .from('leads')
    .update({ client_id: client.id })
    .eq('id', leadId)

  if (linkError) return `Client created but linking it to the lead failed: ${linkError.message}`

  return null
}

export async function addActivity(formData: FormData) {
  const rawLeadId = formData.get('leadId')
  const rawClientId = formData.get('clientId')

  const user = await requireModule(rawLeadId ? 'leads' : 'clients')

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
