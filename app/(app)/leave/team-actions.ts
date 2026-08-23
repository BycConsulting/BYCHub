'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { leaveRequestIdSchema } from '@/lib/validation'

async function reviewTeamRequest(formData: FormData, status: 'approved' | 'rejected') {
  const currentUser = await requireUser()

  const parsed = leaveRequestIdSchema.safeParse({ requestId: formData.get('requestId') })

  if (!parsed.success) {
    redirect('/leave?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()

  const { data: request } = await admin
    .from('leave_requests')
    .select('id, user_id, status')
    .eq('id', parsed.data.requestId)
    .single()

  if (!request || request.status !== 'pending') {
    redirect('/leave?error=' + encodeURIComponent('Request not found or already resolved'))
  }

  // Same self-approval guard as the HR-side reviewRequest — checked before
  // the manager-relationship lookup, so it holds even in the nonsensical
  // case of someone being recorded as their own manager (Task 2's zod
  // refine already blocks that at assignment time; this is defense in
  // depth, not the only guard).
  if (request.user_id === currentUser.id) {
    redirect('/leave?error=' + encodeURIComponent('You cannot review your own request'))
  }

  const { data: profile } = await admin
    .from('employee_profiles')
    .select('manager_id')
    .eq('user_id', request.user_id)
    .single()

  // Not authorized unless the acting user is genuinely this request's
  // employee's assigned manager — covers both "not their report at all"
  // and "was their report, but the manager was reassigned since this
  // request was submitted" (routing is always computed live, never
  // snapshotted, per the design spec).
  if (!profile || profile.manager_id !== currentUser.id) {
    redirect('/leave?error=' + encodeURIComponent('You are not authorized to review this request'))
  }

  // Re-check `status = 'pending'` in the update's own filter (not just the
  // fetch above), and confirm via `.select().single()` that the update
  // actually matched a row — same race-safety and silent-no-op guard as
  // the HR-side `reviewRequest` in app/(app)/users/leave-requests/actions.ts.
  const { data: updated, error } = await admin
    .from('leave_requests')
    .update({ status, reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
    .eq('id', parsed.data.requestId)
    .eq('status', 'pending')
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Request not found or already resolved' : error.message
    redirect('/leave?error=' + encodeURIComponent(message))
  }

  revalidatePath('/leave')
  redirect('/leave')
}

export async function approveTeamRequest(formData: FormData) {
  await reviewTeamRequest(formData, 'approved')
}

export async function rejectTeamRequest(formData: FormData) {
  await reviewTeamRequest(formData, 'rejected')
}
