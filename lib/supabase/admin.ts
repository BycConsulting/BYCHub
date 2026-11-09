import { createClient as createRawClient } from '@supabase/supabase-js'
import { requireEnv } from '@/lib/env'
import type { Database } from '@/types/database'

// Service-role client: bypasses RLS. Import only from server-only code
// (Server Actions), never from a Client Component.
export function createAdminSupabaseClient() {
  return createRawClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL', { NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL }),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
