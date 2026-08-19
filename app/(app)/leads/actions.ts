'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/access'
import { createLeadSchema } from '@/lib/validation'

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
