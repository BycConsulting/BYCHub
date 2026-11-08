'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createReportSchema } from '@/lib/validation'
import { STANDARD_PAGES } from '@/lib/meta/layout'

export async function createReport(formData: FormData) {
  const user = await requireModule('clients')

  const rawClientId = formData.get('clientId')
  const back = `/clients/${rawClientId}`

  const parsed = createReportSchema.safeParse({ clientId: rawClientId, adAccountId: formData.get('adAccountId') })

  if (!parsed.success) {
    redirect(`${back}?error=` + encodeURIComponent('Map an ad account first'))
  }

  const { clientId, adAccountId } = parsed.data
  const supabase = await createClient()

  const { data: mapped } = await supabase
    .from('client_ad_accounts')
    .select('id')
    .eq('client_id', clientId)
    .eq('ad_account_id', adAccountId)
    .maybeSingle()

  if (!mapped) {
    redirect(`${back}?error=` + encodeURIComponent('That ad account is not mapped to this client'))
  }

  const { data: created, error } = await supabase
    .from('report_layouts')
    .insert({
      client_id: clientId,
      name: 'Meta report',
      ad_account_id: adAccountId,
      orientation: 'landscape',
      pages: STANDARD_PAGES,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !created) {
    redirect(`${back}?error=` + encodeURIComponent(error?.message ?? 'Failed to create report'))
  }

  revalidatePath(back)
  redirect(`${back}/reports/${created.id}`)
}
