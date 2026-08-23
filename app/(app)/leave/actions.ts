'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { submitLeaveRequestSchema, leaveRequestIdSchema } from '@/lib/validation'
import { rangesOverlap } from '@/lib/leave'

export async function submitLeaveRequest(formData: FormData) {
  const currentUser = await requireUser()

  const parsed = submitLeaveRequestSchema.safeParse({
    type: formData.get('type'),
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
    reason: formData.get('reason'),
  })

  if (!parsed.success) {
    redirect('/leave?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const supabase = await createClient()

  const { data: existing, error: existingError } = await supabase
    .from('leave_requests')
    .select('start_date, end_date')
    .eq('user_id', currentUser.id)
    .in('status', ['pending', 'approved'])

  if (existingError) {
    redirect('/leave?error=' + encodeURIComponent('Could not verify your existing requests, please retry'))
  }

  const overlaps = (existing ?? []).some((request) =>
    rangesOverlap(parsed.data.startDate, parsed.data.endDate, request.start_date, request.end_date)
  )

  if (overlaps) {
    redirect('/leave?error=' + encodeURIComponent('This date range overlaps an existing request'))
  }

  const { error } = await supabase.from('leave_requests').insert({
    user_id: currentUser.id,
    type: parsed.data.type,
    start_date: parsed.data.startDate,
    end_date: parsed.data.endDate,
    reason: parsed.data.reason,
  })

  if (error) {
    redirect('/leave?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/leave')
  redirect('/leave')
}

export async function cancelLeaveRequest(formData: FormData) {
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

  if (!request || request.user_id !== currentUser.id || request.status !== 'pending') {
    redirect('/leave?error=' + encodeURIComponent('Request not found or no longer pending'))
  }

  // Re-check `status = 'pending'` in the update's own filter (not just the
  // fetch above) so a request that got approved/rejected/cancelled in the
  // narrow window between the fetch and this update can't be silently
  // cancelled anyway — and `.select().single()` confirms the update
  // actually matched a row rather than silently no-op'ing.
  const { data: updated, error } = await admin
    .from('leave_requests')
    .update({ status: 'cancelled' })
    .eq('id', parsed.data.requestId)
    .eq('user_id', currentUser.id)
    .eq('status', 'pending')
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Request no longer pending' : error.message
    redirect('/leave?error=' + encodeURIComponent(message))
  }

  revalidatePath('/leave')
  redirect('/leave')
}
