import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { Module, UserRole } from '@/types/database'

export interface CurrentUser {
  id: string
  email: string
  name: string
  role: UserRole
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('id, email, name, role, is_active')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.is_active) {
    // Valid Auth session but no active employee profile (orphaned invite,
    // bad seed, or a deactivated employee). Returning null alone would make
    // requireUser() bounce to /login, where middleware sees the still-valid
    // session and sends them back — an unbreakable loop in which the layout
    // (and its sign-out button) never renders. Dropping the session turns
    // that loop into a clean stop.
    await supabase.auth.signOut()
    return null
  }

  return { id: profile.id, email: profile.email, name: profile.name, role: profile.role }
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

const MODULE_ORDER: Module[] = ['dashboard', 'leads', 'clients', 'hr', 'settings']

const MODULE_PATHS: Record<Module, string> = {
  dashboard: '/dashboard',
  leads: '/leads',
  clients: '/clients',
  hr: '/users',
  settings: '/settings',
}

export async function getEnabledModules(role: UserRole): Promise<Module[]> {
  if (role === 'admin') return [...MODULE_ORDER]

  const admin = createAdminSupabaseClient()
  const { data } = await admin.from('role_module_access').select('module').eq('role', role).eq('enabled', true)

  const enabledSet = new Set((data ?? []).map((row) => row.module))
  return MODULE_ORDER.filter((moduleKey) => enabledSet.has(moduleKey))
}

export async function requireModule(moduleKey: Module): Promise<CurrentUser> {
  const user = await requireUser()
  if (user.role === 'admin') return user

  const enabled = await getEnabledModules(user.role)
  if (enabled.includes(moduleKey)) return user

  redirect(enabled.length > 0 ? MODULE_PATHS[enabled[0]] : '/profile')
}
