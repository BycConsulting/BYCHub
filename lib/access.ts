import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { moduleKeys } from '@/lib/validation'
import type { Module, UserRole } from '@/types/database'

export interface CurrentUser {
  id: string
  email: string
  name: string
  role: UserRole
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
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
})

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export async function requireAdminRole(): Promise<CurrentUser> {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/profile')
  return user
}

const MODULE_ORDER: Module[] = [...moduleKeys]

const MODULE_PATHS: Record<Module, string> = {
  dashboard: '/dashboard',
  leads: '/leads',
  clients: '/clients',
  hr: '/users',
  settings: '/settings',
  directory: '/hrm/directory',
  leave_attendance: '/hrm/leave',
  onboarding: '/hrm/onboarding',
  offboarding: '/hrm/offboarding',
  recruitment: '/hrm/recruitment',
  tasks: '/tasks',
}

export const getEnabledModules = cache(async (role: UserRole): Promise<Module[]> => {
  if (role === 'admin') return [...MODULE_ORDER]

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin.from('role_module_access').select('module').eq('role', role).eq('enabled', true)

  if (error) {
    console.error(`getEnabledModules: failed to query role_module_access for role "${role}":`, error.message)
  }

  const enabledSet = new Set((data ?? []).map((row) => row.module))
  return MODULE_ORDER.filter((moduleKey) => enabledSet.has(moduleKey))
})

export async function requireModule(moduleKey: Module): Promise<CurrentUser> {
  const user = await requireUser()
  if (user.role === 'admin') return user

  const enabled = await getEnabledModules(user.role)
  if (enabled.includes(moduleKey)) return user

  redirect(enabled.length > 0 ? MODULE_PATHS[enabled[0]] : '/profile')
}
