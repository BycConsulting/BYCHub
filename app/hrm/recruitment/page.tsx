import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createOpening, toggleOpeningStatus } from './actions'

export default async function RecruitmentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('recruitment')
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: openings, error: openingsError } = await admin
    .from('job_openings')
    .select('id, title, department, status, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">Recruitment</h1>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <form
        action={createOpening}
        className="flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <label className="flex-1 text-sm text-slate-700">
          Title
          <input
            name="title"
            required
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
        </label>
        <label className="flex-1 text-sm text-slate-700">
          Department
          <input
            name="department"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Create
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {openingsError ? (
          <p className="p-4 text-sm text-red-700">Could not load job openings</p>
        ) : openings && openings.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {openings.map((opening) => (
              <li key={opening.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <Link
                    href={`/hrm/recruitment/${opening.id}`}
                    className="font-medium text-slate-800 hover:underline"
                  >
                    {opening.title}
                  </Link>
                  <span className="ml-2 text-slate-400">{opening.department || '—'}</span>
                  <span
                    className={`ml-2 rounded px-1.5 py-0.5 text-xs ${
                      opening.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {opening.status}
                  </span>
                </div>
                <form action={toggleOpeningStatus}>
                  <input type="hidden" name="openingId" value={opening.id} />
                  <input type="hidden" name="status" value={opening.status === 'open' ? 'closed' : 'open'} />
                  <button type="submit" className="text-slate-600 underline hover:text-slate-900">
                    {opening.status === 'open' ? 'Close' : 'Reopen'}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-sm text-slate-500">No job openings yet.</p>
        )}
      </div>
    </div>
  )
}
