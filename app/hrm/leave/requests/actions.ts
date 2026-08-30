'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { leaveRequestIdSchema } from '@/lib/validation'

async function reviewRequest(formData: FormData, status: 'approved' | 'rejected') {
  const currentUser = await requireModule('leave_attendance')
  if (currentUser.role !== 'hr' && currentUser.role !== 'admin') {
    redirect('/hrm/leave')
  }

  const parsed = leaveRequestIdSchema.safeParse({ requestId: formData.get('requestId') })

  if (!parsed.success) {
    redirect('/hrm/leave/requests?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()

  const { data: request } = await admin
    .from('leave_requests')
    .select('id, user_id, status')
    .eq('id', parsed.data.requestId)
    .single()

  if (!request || request.status !== 'pending') {
    redirect('/hrm/leave/requests?error=' + encodeURIComponent('Request not found or already resolved'))
  }

  if (request.user_id === currentUser.id) {
    redirect('/hrm/leave/requests?error=' + encodeURIComponent('You cannot review your own request'))
  }

  const { data: updated, error } = await admin
    .from('leave_requests')
    .update({ status, reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
    .eq('id', parsed.data.requestId)
    .eq('status', 'pending')
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Request not found or already resolved' : error.message
    redirect('/hrm/leave/requests?error=' + encodeURIComponent(message))
  }

  revalidatePath('/hrm/leave/requests')
  redirect('/hrm/leave/requests')
}

export async function approveLeaveRequest(formData: FormData) {
  await reviewRequest(formData, 'approved')
}

export async function rejectLeaveRequest(formData: FormData) {
  await reviewRequest(formData, 'rejected')
}
