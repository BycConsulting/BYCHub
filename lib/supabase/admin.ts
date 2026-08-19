import { createClient as createRawClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Service-role client: bypasses RLS. Import only from server-only code
// (Server Actions), never from a Client Component.
export function createAdminSupabaseClient() {
  return createRawClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
