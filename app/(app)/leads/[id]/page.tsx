import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { leadStages } from '@/lib/validation'
import { updateLeadStage, addActivity } from '../actions'
import { requireModule } from '@/lib/access'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { FormSelect } from '@/components/ui/form-select'

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('leads')
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('id, contact_name, contact_company, contact_email, stage, source, notes, client_id')
    .eq('id', id)
    .single()

  if (!lead) notFound()

  const { data: activities } = await supabase
    .from('activities')
    .select('id, type, body, created_at')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })

  const stageOptions = leadStages.map((stage) => ({ value: stage, label: stage }))
  const activityTypeOptions = [
    { value: 'note', label: 'Note' },
    { value: 'call', label: 'Call' },
    { value: 'email', label: 'Email' },
  ]

  return (
    <div className="max-w-3xl space-y-6">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{lead.contact_name}</CardTitle>
          <p className="text-sm text-slate-500">
            {lead.contact_company} · {lead.contact_email}
          </p>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-700">{lead.notes}</p>

          {lead.client_id ? (
            <p className="mt-2 text-sm text-green-700">Converted to client.</p>
          ) : (
            <form action={updateLeadStage} className="mt-3 flex items-center gap-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <FormSelect name="stage" options={stageOptions} defaultValue={lead.stage} />
              <Button type="submit">Update stage</Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={addActivity} className="space-y-2">
            <input type="hidden" name="leadId" value={lead.id} />
            <FormSelect name="type" options={activityTypeOptions} defaultValue="note" />
            <Textarea name="body" placeholder="What happened?" required className="w-full" />
            <Button type="submit">Add activity</Button>
          </form>

          <ul className="mt-4 space-y-2">
            {(activities ?? []).map((activity) => (
              <li key={activity.id} className="rounded-lg border border-slate-100 p-2 text-sm">
                <Badge variant="outline" className="capitalize">
                  {activity.type}
                </Badge>{' '}
                <span className="text-slate-600">— {activity.body}</span>
                <div className="text-xs text-slate-400">{new Date(activity.created_at).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
