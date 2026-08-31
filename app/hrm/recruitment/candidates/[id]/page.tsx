import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { ConfirmSubmitButton } from '@/app/(app)/confirm-submit-button'
import { updateCandidateStage, rejectCandidate, updateCandidateNotes } from './actions'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { FormSelect } from '@/components/ui/form-select'

const STAGES = [
  { value: 'applied', label: 'Applied' },
  { value: 'screening', label: 'Screening' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'hired', label: 'Hired' },
] as const

function stageBadgeVariant(stage: string): 'default' | 'secondary' | 'destructive' {
  if (stage === 'rejected') return 'destructive'
  if (stage === 'hired') return 'default'
  return 'secondary'
}

export default async function CandidateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('recruitment')
  const { id } = await params
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: candidate, error: candidateError } = await admin
    .from('candidates')
    .select('*')
    .eq('id', id)
    .single()

  if (candidateError && candidateError.code !== 'PGRST116') {
    throw new Error(`Could not load candidate: ${candidateError.message}`)
  }

  if (!candidate) notFound()

  const { data: opening } = await admin
    .from('job_openings')
    .select('id, title')
    .eq('id', candidate.opening_id)
    .single()

  return (
    <div className="max-w-2xl space-y-4">
      <Link
        href={`/hrm/recruitment/${candidate.opening_id}`}
        className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
      >
        ← Back to {opening?.title ?? 'opening'}
      </Link>
      <h1 className="text-xl font-semibold text-slate-800">{candidate.name}</h1>
      <p className="text-sm text-slate-500">
        {candidate.email || '—'} · {candidate.phone || '—'}
      </p>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <Card>
        <CardContent>
          <h2 className="text-sm font-medium text-slate-500">Stage</h2>
          <div className="mt-1">
            <Badge variant={stageBadgeVariant(candidate.stage)} className="capitalize">
              {candidate.stage}
            </Badge>
          </div>

          {candidate.stage !== 'rejected' && (
            <div className="mt-3 flex items-center gap-3">
              <form action={updateCandidateStage} className="flex items-center gap-2">
                <input type="hidden" name="candidateId" value={candidate.id} />
                <FormSelect name="stage" options={[...STAGES]} defaultValue={candidate.stage} />
                <Button type="submit">Update stage</Button>
              </form>
              <form action={rejectCandidate}>
                <input type="hidden" name="candidateId" value={candidate.id} />
                <ConfirmSubmitButton
                  confirmMessage="Reject this candidate? This cannot be undone."
                  className={buttonVariants({ variant: 'destructive' })}
                >
                  Reject
                </ConfirmSubmitButton>
              </form>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-500">Resume / notes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{candidate.resume_notes || '—'}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <form action={updateCandidateNotes} className="space-y-2">
            <input type="hidden" name="candidateId" value={candidate.id} />
            <label className="block text-sm text-slate-700">
              Notes
              <Textarea name="notes" defaultValue={candidate.notes} rows={3} className="mt-1 w-full" />
            </label>
            <Button type="submit">Save notes</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
