'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { leaveRequestIdSchema } from '@/lib/validation'

async function reviewRequest(formData: FormData, status: 'approved' | 'rejected') {
  const currentUser = await requireModule('hr')

  const parsed = leaveRequestIdSchema.safeParse({ requestId: formData.get('requestId') })

  if (!parsed.success) {
    redirect('/users/leave-requests?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()

  const { data: request } = await admin
    .from('leave_requests')
    .select('id, status')
    .eq('id', parsed.data.requestId)
    .single()

  if (!request || request.status !== 'pending') {
    redirect('/users/leave-requests?error=' + encodeURIComponent('Request not found or already resolved'))
  }

  // Re-check `status = 'pending'` in the update's own filter (not just the
  // fetch above), and confirm via `.select().single()` that the update
  // actually matched a row — same race-safety and silent-no-op guard as
  // `cancelLeaveRequest` in app/(app)/leave/actions.ts.
  const { data: updated, error } = await admin
    .from('leave_requests')
    .update({ status, reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
    .eq('id', parsed.data.requestId)
    .eq('status', 'pending')
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Request not found or already resolved' : error.message
    redirect('/users/leave-requests?error=' + encodeURIComponent(message))
  }

  revalidatePath('/users/leave-requests')
  redirect('/users/leave-requests')
}

export async function approveLeaveRequest(formData: FormData) {
  await reviewRequest(formData, 'approved')
}

export async function rejectLeaveRequest(formData: FormData) {
  await reviewRequest(formData, 'rejected')
}
