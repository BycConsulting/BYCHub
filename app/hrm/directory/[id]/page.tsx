import { notFound } from 'next/navigation'
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

export default async function DirectoryProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireModule('directory')
  const { id } = await params

  const admin = createAdminSupabaseClient()

  const { data: user, error: userError } = await admin
    .from('users')
    .select('id, name, is_active')
    .eq('id', id)
    .single()

  if (userError && userError.code !== 'PGRST116') {
    throw new Error(`Could not load employee: ${userError.message}`)
  }

  if (!user || !user.is_active) {
    notFound()
  }

  const { data: profile, error: profileError } = await admin
    .from('employee_profiles')
    .select('designation, department, employment_type, employment_start_date, manager_id')
    .eq('user_id', id)
    .maybeSingle()

  if (profileError) {
    throw new Error(`Could not load employee profile: ${profileError.message}`)
  }

  let managerName: string | null = null
  if (profile?.manager_id) {
    const { data: manager, error: managerError } = await admin
      .from('users')
      .select('name, is_active')
      .eq('id', profile.manager_id)
      .maybeSingle()

    if (managerError) {
      throw new Error(`Could not load manager details: ${managerError.message}`)
    }

    managerName = manager?.is_active ? manager.name : null
  }

  const fields = [
    { label: 'Designation', value: profile?.designation },
    { label: 'Department', value: profile?.department },
    { label: 'Employment type', value: profile?.employment_type },
    { label: 'Start date', value: profile?.employment_start_date },
    { label: 'Manager', value: managerName },
  ]

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_0_rgba(30,41,59,0.06),0_2px_6px_-1px_rgba(30,41,59,0.08)]">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-800 text-lg font-semibold text-white">
          {initialsFor(user.name)}
        </div>
        <h1 className="text-xl font-semibold text-slate-800">{user.name}</h1>
      </div>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_0_rgba(30,41,59,0.06),0_2px_6px_-1px_rgba(30,41,59,0.08)]">
        {fields.map((field) => (
          <div key={field.label} className="flex justify-between px-6 py-3 text-sm">
            <span className="text-slate-500">{field.label}</span>
            <span className="font-medium text-slate-800">{field.value ?? '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
