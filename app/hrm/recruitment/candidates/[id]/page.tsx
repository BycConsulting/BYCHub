import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { ConfirmSubmitButton } from '@/app/(app)/confirm-submit-button'
import { updateCandidateStage, rejectCandidate, updateCandidateNotes } from './actions'

const STAGES = [
  { value: 'applied', label: 'Applied' },
  { value: 'screening', label: 'Screening' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'hired', label: 'Hired' },
] as const

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

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_0_rgba(30,41,59,0.06),0_2px_6px_-1px_rgba(30,41,59,0.08)]">
        <h2 className="text-sm font-medium text-slate-500">Stage</h2>
        <p className="mt-1 text-lg font-semibold text-slate-800 capitalize">{candidate.stage}</p>

        {candidate.stage !== 'rejected' && (
          <div className="mt-3 flex items-center gap-3">
            <form action={updateCandidateStage} className="flex items-center gap-2">
              <input type="hidden" name="candidateId" value={candidate.id} />
              <select
                name="stage"
                defaultValue={candidate.stage}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
              >
                {STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 active:scale-[0.98] transition-transform"
              >
                Update stage
              </button>
            </form>
            <form action={rejectCandidate}>
              <input type="hidden" name="candidateId" value={candidate.id} />
              <ConfirmSubmitButton
                confirmMessage="Reject this candidate? This cannot be undone."
                className="text-red-600 underline"
              >
                Reject
              </ConfirmSubmitButton>
            </form>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_0_rgba(30,41,59,0.06),0_2px_6px_-1px_rgba(30,41,59,0.08)]">
        <h2 className="text-sm font-medium text-slate-500">Resume / notes</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{candidate.resume_notes || '—'}</p>
      </div>

      <form
        action={updateCandidateNotes}
        className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_0_rgba(30,41,59,0.06),0_2px_6px_-1px_rgba(30,41,59,0.08)]"
      >
        <input type="hidden" name="candidateId" value={candidate.id} />
        <label className="block text-sm text-slate-700">
          Notes
          <textarea
            name="notes"
            defaultValue={candidate.notes}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700 active:scale-[0.98] transition-transform"
        >
          Save notes
        </button>
      </form>
    </div>
  )
}
