'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createReportSchema, refreshReportSchema } from '@/lib/validation'
import { pagesSchemaFor, STANDARD_PAGES } from '@/lib/meta/layout'
import { fetchInsights, MetaError } from '@/lib/meta/client'
import { partitionResults, planFetches } from '@/lib/meta/plan'
import { previousPeriod } from '@/lib/meta/ranges'

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

function reportUrl(clientId: string, layoutId: string, from: string, to: string, compare: boolean, error?: string) {
  const params = new URLSearchParams({ from, to })
  if (compare) params.set('compare', '1')
  if (error) params.set('error', error)
  return `/clients/${clientId}/reports/${layoutId}?${params}`
}

/** Fetches every widget query from Meta and overwrites the saved copy. Only runs when someone presses Refresh. */
export async function refreshReport(formData: FormData) {
  await requireModule('clients')

  const parsed = refreshReportSchema.safeParse({
    layoutId: formData.get('layoutId'),
    clientId: formData.get('clientId'),
    from: formData.get('from'),
    to: formData.get('to'),
    compare: formData.get('compare') === '1',
  })

  if (!parsed.success) {
    redirect(`/clients/${formData.get('clientId')}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const { layoutId, clientId, from, to, compare } = parsed.data
  const range = { from, to }
  const supabase = await createClient()

  const { data: layout } = await supabase
    .from('report_layouts')
    .select('ad_account_id, pages, orientation')
    .eq('id', layoutId)
    .eq('client_id', clientId)
    .single()

  if (!layout) redirect(`/clients/${clientId}?error=` + encodeURIComponent('Report not found'))

  const pages = pagesSchemaFor(layout.orientation).safeParse(layout.pages)
  if (!pages.success) {
    redirect(reportUrl(clientId, layoutId, from, to, compare, 'This report layout is invalid'))
  }

  const fetches = planFetches(pages.data, layout.ad_account_id, range, compare)

  const results = await Promise.all(
    fetches.map(async (f) => {
      try {
        const [rows, previous] = await Promise.all([
          fetchInsights(layout.ad_account_id, f.query, range),
          f.withPrevious ? fetchInsights(layout.ad_account_id, f.query, previousPeriod(range)) : Promise.resolve(undefined),
        ])
        return { key: f.key, payload: { rows, ...(previous ? { previous } : {}) } }
      } catch (err) {
        const message = err instanceof MetaError ? err.message : 'Could not reach Meta.'
        return { key: f.key, payload: { rows: [], error: message } }
      }
    })
  )

  const { toSave, failures } = partitionResults(results)

  if (toSave.length > 0) {
    const { error } = await supabase.from('report_data_cache').upsert(
      toSave.map((r) => ({ layout_id: layoutId, query_key: r.key, payload: r.payload, fetched_at: new Date().toISOString() })),
      { onConflict: 'layout_id,query_key' }
    )
    if (error) redirect(reportUrl(clientId, layoutId, from, to, compare, error.message))
  }

  if (failures.length > 0) {
    revalidatePath(`/clients/${clientId}/reports/${layoutId}`)
    redirect(reportUrl(clientId, layoutId, from, to, compare, `Some widgets could not refresh (previous data kept): ${failures.join(' ')}`))
  }

  revalidatePath(`/clients/${clientId}/reports/${layoutId}`)
  redirect(reportUrl(clientId, layoutId, from, to, compare))
}

export async function saveReport(
  layoutId: string,
  name: string,
  orientation: 'landscape' | 'portrait',
  pages: unknown
): Promise<{ error: string | null }> {
  await requireModule('clients')

  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 120) return { error: 'Give the report a name (up to 120 characters)' }
  if (orientation !== 'landscape' && orientation !== 'portrait') return { error: 'Invalid orientation' }

  const parsed = pagesSchemaFor(orientation).safeParse(pages)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('report_layouts')
    .update({ name: trimmed, orientation, pages: parsed.data, updated_at: new Date().toISOString() })
    .eq('id', layoutId)
    .select('client_id')
    .single()

  if (error || !updated) return { error: error?.message ?? 'Report not found' }

  revalidatePath(`/clients/${updated.client_id}/reports/${layoutId}`)
  revalidatePath(`/clients/${updated.client_id}`)
  return { error: null }
}
