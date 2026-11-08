'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { leaveRequestIdSchema } from '@/lib/validation'

async function reviewTeamRequest(formData: FormData, status: 'approved' | 'rejected') {
  const currentUser = await requireModule('leave_attendance')

  const parsed = leaveRequestIdSchema.safeParse({ requestId: formData.get('requestId') })

  if (!parsed.success) {
    redirect('/hrm/leave?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()

  const { data: request } = await admin
    .from('leave_requests')
    .select('id, user_id, status')
    .eq('id', parsed.data.requestId)
    .single()

  if (!request || request.status !== 'pending') {
    redirect('/hrm/leave?error=' + encodeURIComponent('Request not found or already resolved'))
  }

  if (request.user_id === currentUser.id) {
    redirect('/hrm/leave?error=' + encodeURIComponent('You cannot review your own request'))
  }

  const { data: profile } = await admin
    .from('employee_profiles')
    .select('manager_id')
    .eq('user_id', request.user_id)
    .single()

  if (!profile || profile.manager_id !== currentUser.id) {
    redirect('/hrm/leave?error=' + encodeURIComponent('You are not authorized to review this request'))
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
    redirect('/hrm/leave?error=' + encodeURIComponent(message))
  }

  revalidatePath('/hrm/leave')
  redirect('/hrm/leave')
}

export async function approveTeamRequest(formData: FormData) {
  await reviewTeamRequest(formData, 'approved')
}

export async function rejectTeamRequest(formData: FormData) {
  await reviewTeamRequest(formData, 'rejected')
}
