'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { addClientMetricSchema, deleteClientMetricSchema } from '@/lib/validation'

export async function addClientMetric(formData: FormData) {
  const user = await requireModule('clients')

  const rawClientId = formData.get('clientId')

  const parsed = addClientMetricSchema.safeParse({
    clientId: rawClientId,
    period: formData.get('period'),
    channel: formData.get('channel'),
    metricKey: formData.get('metricKey'),
    metricLabel: formData.get('metricLabel'),
    value: formData.get('value'),
    unit: formData.get('unit'),
    notes: formData.get('notes'),
  })

  if (!parsed.success) {
    redirect(`/clients/${rawClientId}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const { clientId, period, channel, metricKey, metricLabel, value, unit, notes } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.from('client_metrics').upsert(
    {
      client_id: clientId,
      period: `${period}-01`,
      channel,
      metric_key: metricKey || 'custom',
      metric_label: metricLabel,
      value,
      unit: unit || '',
      notes: notes || '',
      created_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id,period,channel,metric_label' }
  )

  if (error) {
    redirect(`/clients/${clientId}?error=` + encodeURIComponent(error.message))
  }

  revalidatePath(`/clients/${clientId}`)
  revalidatePath(`/clients/${clientId}/dashboard`)
  redirect(`/clients/${clientId}?period=${period}`)
}

export async function deleteClientMetric(formData: FormData) {
  await requireModule('clients')

  const rawClientId = formData.get('clientId')

  const parsed = deleteClientMetricSchema.safeParse({
    metricId: formData.get('metricId'),
    clientId: rawClientId,
    period: formData.get('period') ?? undefined,
  })

  if (!parsed.success) {
    redirect(`/clients/${rawClientId}?error=` + encodeURIComponent(parsed.error.issues[0].message))
  }

  const { metricId, clientId, period } = parsed.data
  const periodSuffix = period ? `?period=${period}` : ''

  const supabase = await createClient()
  const { data: deleted, error } = await supabase
    .from('client_metrics')
    .delete()
    .eq('id', metricId)
    .eq('client_id', clientId)
    .select('id')
    .single()

  if (!deleted) {
    const message = !error || error.code === 'PGRST116' ? 'Metric not found' : error.message
    redirect(`/clients/${clientId}${periodSuffix}${periodSuffix ? '&' : '?'}error=` + encodeURIComponent(message))
  }

  revalidatePath(`/clients/${clientId}`)
  revalidatePath(`/clients/${clientId}/dashboard`)
  redirect(`/clients/${clientId}${periodSuffix}`)
}
