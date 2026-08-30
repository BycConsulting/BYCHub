import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { startOnboarding } from './actions'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('onboarding')
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: checklists, error: checklistsError } = await admin
    .from('onboarding_checklists')
    .select('id, user_id, started_at, completed_at')
    .order('started_at', { ascending: false })

  const { data: activeUsers, error: usersError } = await admin
    .from('users')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  const checklistUserIds = [...new Set((checklists ?? []).map((c) => c.user_id))]
  const { data: checklistUsers } =
    checklistUserIds.length > 0
      ? await admin.from('users').select('id, name').in('id', checklistUserIds)
      : { data: [] }
  const nameById = new Map((checklistUsers ?? []).map((u) => [u.id, u.name]))

  const inProgressUserIds = new Set((checklists ?? []).filter((c) => !c.completed_at).map((c) => c.user_id))
  const availableUsers = (activeUsers ?? []).filter((u) => !inProgressUserIds.has(u.id))

  const inProgress = (checklists ?? []).filter((c) => !c.completed_at)
  const completed = (checklists ?? []).filter((c) => c.completed_at)

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">Onboarding</h1>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <form
        action={startOnboarding}
        className="flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <label className="flex-1 text-sm text-slate-700">
          Start onboarding for
          <select
            name="userId"
            required
            defaultValue=""
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none"
          >
            <option value="" disabled>
              Select an employee
            </option>
            {availableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Start
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="px-4 pt-4 text-lg font-semibold text-slate-800">In progress</h2>
        {checklistsError || usersError ? (
          <p className="p-4 text-sm text-red-700">Could not load onboarding checklists</p>
        ) : inProgress.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No onboarding in progress.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {inProgress.map((c) => (
              <li key={c.id} className="px-4 py-3 text-sm">
                <Link href={`/hrm/onboarding/${c.id}`} className="font-medium text-slate-800 hover:underline">
                  {nameById.get(c.user_id) ?? 'Unknown'}
                </Link>
                <span className="ml-2 text-slate-400">started {c.started_at.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {completed.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="px-4 pt-4 text-lg font-semibold text-slate-800">Completed</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {completed.map((c) => (
              <li key={c.id} className="px-4 py-3 text-sm">
                <Link href={`/hrm/onboarding/${c.id}`} className="font-medium text-slate-800 hover:underline">
                  {nameById.get(c.user_id) ?? 'Unknown'}
                </Link>
                <span className="ml-2 text-slate-400">completed {c.completed_at!.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
