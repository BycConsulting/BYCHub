'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { correctAttendanceSchema } from '@/lib/validation'
import { istWallClockToUtcIso, todayDate } from '@/lib/attendance'

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
    .select('id, date, checked_in_at, checked_out_at')
    .eq('id', parsed.data.recordId)
    .single()

  if (!record) {
    redirect('/hrm/attendance/records?error=' + encodeURIComponent('Record not found'))
  }

  // Bound checks: a correction must land on the record's own day (the IST
  // wall-clock date portion the form submitted, before UTC conversion below)
  // and never in the future — nothing else in this action previously
  // stopped either.
  if (parsed.data.checkedInAt && !parsed.data.checkedInAt.startsWith(record.date)) {
    redirect('/hrm/attendance/records?error=' + encodeURIComponent('Check-in time must fall on this record\'s date'))
  }
  if (parsed.data.checkedOutAt && !parsed.data.checkedOutAt.startsWith(record.date)) {
    redirect('/hrm/attendance/records?error=' + encodeURIComponent('Checkout time must fall on this record\'s date'))
  }
  if (record.date > todayDate()) {
    redirect('/hrm/attendance/records?error=' + encodeURIComponent('Cannot correct a future-dated record'))
  }

  const checkedInAt = parsed.data.checkedInAt ? istWallClockToUtcIso(parsed.data.checkedInAt) : record.checked_in_at
  const checkedOutAt = parsed.data.checkedOutAt
    ? istWallClockToUtcIso(parsed.data.checkedOutAt)
    : record.checked_out_at

  if (checkedInAt && checkedOutAt && new Date(checkedOutAt).getTime() < new Date(checkedInAt).getTime()) {
    redirect('/hrm/attendance/records?error=' + encodeURIComponent('Checkout must be after check-in'))
  }

  const now = Date.now()
  if ((checkedInAt && new Date(checkedInAt).getTime() > now) || (checkedOutAt && new Date(checkedOutAt).getTime() > now)) {
    redirect('/hrm/attendance/records?error=' + encodeURIComponent('Time cannot be in the future'))
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
