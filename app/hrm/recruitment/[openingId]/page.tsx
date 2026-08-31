import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { addCandidate } from './actions'

const STAGE_LABELS: Record<string, string> = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
}

export default async function OpeningDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ openingId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('recruitment')
  const { openingId } = await params
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: opening, error: openingError } = await admin
    .from('job_openings')
    .select('id, title, department, status')
    .eq('id', openingId)
    .single()

  if (openingError && openingError.code !== 'PGRST116') {
    throw new Error(`Could not load job opening: ${openingError.message}`)
  }

  if (!opening) notFound()

  const { data: candidates, error: candidatesError } = await admin
    .from('candidates')
    .select('id, name, email, stage, applied_at')
    .eq('opening_id', openingId)
    .order('applied_at', { ascending: false })

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/hrm/recruitment" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to Recruitment
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-slate-800">{opening.title}</h1>
        <p className="text-sm text-slate-500">
          {opening.department || '—'} · {opening.status}
        </p>
      </div>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <form
        action={addCandidate}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_0_rgba(30,41,59,0.06),0_2px_6px_-1px_rgba(30,41,59,0.08)]"
      >
        <input type="hidden" name="openingId" value={opening.id} />
        <div className="grid grid-cols-2 gap-3">
          <input
            name="name"
            placeholder="Name"
            required
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          />
          <input
            name="email"
            placeholder="Email"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          />
          <input
            name="phone"
            placeholder="Phone"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          />
          <input
            name="resumeNotes"
            placeholder="Resume link or notes"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 active:scale-[0.98] transition-transform"
        >
          Add candidate
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_0_rgba(30,41,59,0.06),0_2px_6px_-1px_rgba(30,41,59,0.08)]">
        {candidatesError ? (
          <p className="p-4 text-sm text-red-700">Could not load candidates</p>
        ) : candidates && candidates.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {candidates.map((candidate) => (
              <li key={candidate.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link
                  href={`/hrm/recruitment/candidates/${candidate.id}`}
                  className="font-medium text-slate-800 hover:underline"
                >
                  {candidate.name}
                </Link>
                <span className="text-slate-500">{STAGE_LABELS[candidate.stage]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-sm text-slate-500">No candidates yet.</p>
        )}
      </div>
    </div>
  )
}
