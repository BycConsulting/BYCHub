import { notFound } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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
    { label: 'Designation', value: profile?.designation, badge: false },
    { label: 'Department', value: profile?.department, badge: true },
    { label: 'Employment type', value: profile?.employment_type, badge: true },
    { label: 'Start date', value: profile?.employment_start_date, badge: false },
    { label: 'Manager', value: managerName, badge: false },
  ]

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="flex-row items-center gap-4 p-6">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-800 text-lg font-semibold text-white">
          {initialsFor(user.name)}
        </div>
        <h1 className="text-xl font-semibold text-slate-800">{user.name}</h1>
      </Card>
      <Card className="gap-0 divide-y divide-slate-100 py-0">
        {fields.map((field) => (
          <div key={field.label} className="flex items-center justify-between px-6 py-3 text-sm">
            <span className="text-slate-500">{field.label}</span>
            {field.badge && field.value ? (
              <Badge variant="outline" className="capitalize">
                {field.value}
              </Badge>
            ) : (
              <span className="font-medium text-slate-800">{field.value ?? '—'}</span>
            )}
          </div>
        ))}
      </Card>
    </div>
  )
}
