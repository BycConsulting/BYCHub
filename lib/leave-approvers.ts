// Server-only: who should be told about a new leave request.
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

/** The employee's manager if set; otherwise active HR and admin users (the existing leave routing rule). */
export async function leaveApprovers(employeeId: string): Promise<{ managerId: string | null; hrIds: string[] }> {
  const admin = createAdminSupabaseClient()

  const { data: profile } = await admin
    .from('employee_profiles')
    .select('manager_id')
    .eq('user_id', employeeId)
    .maybeSingle()

  if (profile?.manager_id) return { managerId: profile.manager_id, hrIds: [] }

  const { data: hr } = await admin.from('users').select('id').in('role', ['hr', 'admin']).eq('is_active', true)
  return { managerId: null, hrIds: (hr ?? []).map((u) => u.id) }
}
