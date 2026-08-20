import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/database'

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

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/leads')
  return user
}
