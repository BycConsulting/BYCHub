'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { correctAttendanceSchema } from '@/lib/validation'
import { istWallClockToUtcIso } from '@/lib/attendance'

export async function correctAttendanceRecord(formData: FormData) {
  const currentUser = await requireModule('leave_attendance')
  if (currentUser.role !== 'hr' && currentUser.role !== 'admin') {
    redirect('/hrm/attendance')
  }

  const parsed = correctAttendanceSchema.safeParse({
    recordId: formData.get('recordId'),
    checkedInAt: formData.get('checkedInAt'),
    checkedOutAt: formData.get('checkedOutAt'),
  })

  if (!parsed.success) {
    redirect('/hrm/attendance/records?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  if (!parsed.data.checkedInAt && !parsed.data.checkedOutAt) {
    redirect('/hrm/attendance/records?error=' + encodeURIComponent('Enter at least one time to save'))
  }

  const admin = createAdminSupabaseClient()

  const { data: record } = await admin
    .from('attendance_records')
    .select('id, checked_in_at, checked_out_at')
    .eq('id', parsed.data.recordId)
    .single()

  if (!record) {
    redirect('/hrm/attendance/records?error=' + encodeURIComponent('Record not found'))
  }

  const checkedInAt = parsed.data.checkedInAt ? istWallClockToUtcIso(parsed.data.checkedInAt) : record.checked_in_at
  const checkedOutAt = parsed.data.checkedOutAt
    ? istWallClockToUtcIso(parsed.data.checkedOutAt)
    : record.checked_out_at

  if (checkedInAt && checkedOutAt && new Date(checkedOutAt).getTime() < new Date(checkedInAt).getTime()) {
    redirect('/hrm/attendance/records?error=' + encodeURIComponent('Checkout must be after check-in'))
  }

  const { data: updated, error } = await admin
    .from('attendance_records')
    .update({ checked_in_at: checkedInAt, checked_out_at: checkedOutAt })
    .eq('id', parsed.data.recordId)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Record not found' : error.message
    redirect('/hrm/attendance/records?error=' + encodeURIComponent(message))
  }

  revalidatePath('/hrm/attendance/records')
  redirect('/hrm/attendance/records')
}
