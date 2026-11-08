'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { addAdAccountSchema, removeAdAccountSchema } from '@/lib/validation'

export async function addAdAccount(formData: FormData) {
  await requireModule('clients')

  const rawClientId = formData.get('clientId')

  const parsed = addAdAccountSchema.safeParse({
    clientId: rawClientId,
    adAccountId: formData.get('adAccountId'),
    label: formData.get('label') ?? '',
  })

  if (!parsed.success) {
    redirect('/marketing/ad-accounts?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const { clientId, adAccountId, label } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase
    .from('client_ad_accounts')
    .insert({ client_id: clientId, ad_account_id: adAccountId, label })

  if (error) {
    const message = error.code === '23505' ? 'That ad account is already mapped to this client' : error.message
    redirect('/marketing/ad-accounts?error=' + encodeURIComponent(message))
  }

  revalidatePath('/marketing/ad-accounts')
  revalidatePath('/marketing/meta')
  redirect('/marketing/ad-accounts')
}

export async function removeAdAccount(formData: FormData) {
  await requireModule('clients')

  const rawClientId = formData.get('clientId')

  const parsed = removeAdAccountSchema.safeParse({ id: formData.get('id'), clientId: rawClientId })

  if (!parsed.success) {
    redirect('/marketing/ad-accounts?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('client_ad_accounts')
    .delete()
    .eq('id', parsed.data.id)
    .eq('client_id', parsed.data.clientId)

  if (error) {
    redirect('/marketing/ad-accounts?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/marketing/ad-accounts')
  revalidatePath('/marketing/meta')
  redirect('/marketing/ad-accounts')
}
