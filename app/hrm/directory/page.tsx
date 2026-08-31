import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

function initialsFor(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default async function DirectoryPage() {
  await requireModule('directory')

  const admin = createAdminSupabaseClient()

  const { data: profiles, error: profilesError } = await admin
    .from('employee_profiles')
    .select('user_id, designation, department, manager_id')

  const referencedIds = [
    ...new Set(
      (profiles ?? []).flatMap((p) => [p.user_id, p.manager_id]).filter((id): id is string => id !== null)
    ),
  ]
  const { data: users, error: usersError } =
    referencedIds.length > 0
      ? await admin.from('users').select('id, name, is_active').in('id', referencedIds)
      : { data: [], error: null }
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]))
  const activeById = new Map((users ?? []).map((u) => [u.id, u.is_active]))

  const rows = (profiles ?? [])
    .filter((p) => activeById.get(p.user_id) ?? false)
    .map((p) => ({
      userId: p.user_id,
      name: nameById.get(p.user_id) ?? 'Unknown',
      designation: p.designation,
      department: p.department,
      managerName:
        p.manager_id && (activeById.get(p.manager_id) ?? false) ? (nameById.get(p.manager_id) ?? 'Unknown') : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Directory</h1>
        <p className="text-sm text-slate-500">{rows.length} active employees</p>
      </div>
      {profilesError || usersError ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">Could not load the directory</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">No employees found.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <li key={row.userId}>
              <Link
                href={`/hrm/directory/${row.userId}`}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_0_rgba(30,41,59,0.06),0_2px_6px_-1px_rgba(30,41,59,0.08)] transition hover:border-slate-300 hover:shadow"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white">
                  {initialsFor(row.name)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">{row.name}</div>
                  <div className="truncate text-xs text-slate-500">
                    {row.designation ?? '—'} · {row.department ?? '—'}
                  </div>
                  {row.managerName && (
                    <div className="truncate text-xs text-slate-400">Reports to {row.managerName}</div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
