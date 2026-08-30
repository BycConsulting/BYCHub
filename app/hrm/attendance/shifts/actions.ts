'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createShiftSchema, assignShiftSchema } from '@/lib/validation'
import type { CurrentUser } from '@/lib/access'

async function requireHrOrAdmin(): Promise<CurrentUser> {
  const currentUser = await requireModule('leave_attendance')
  if (currentUser.role !== 'hr' && currentUser.role !== 'admin') {
    redirect('/hrm/attendance')
  }
  return currentUser
}

export async function createShift(formData: FormData) {
  await requireHrOrAdmin()

  const parsed = createShiftSchema.safeParse({
    name: formData.get('name'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
    workingMonday: formData.get('workingMonday') === 'on',
    workingTuesday: formData.get('workingTuesday') === 'on',
    workingWednesday: formData.get('workingWednesday') === 'on',
    workingThursday: formData.get('workingThursday') === 'on',
    workingFriday: formData.get('workingFriday') === 'on',
    workingSaturday: formData.get('workingSaturday') === 'on',
  })

  if (!parsed.success) {
    redirect('/hrm/attendance/shifts?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('shifts').insert({
    name: parsed.data.name,
    start_time: parsed.data.startTime,
    end_time: parsed.data.endTime,
    working_monday: parsed.data.workingMonday,
    working_tuesday: parsed.data.workingTuesday,
    working_wednesday: parsed.data.workingWednesday,
    working_thursday: parsed.data.workingThursday,
    working_friday: parsed.data.workingFriday,
    working_saturday: parsed.data.workingSaturday,
  })

  if (error) {
    redirect('/hrm/attendance/shifts?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/hrm/attendance/shifts')
  redirect('/hrm/attendance/shifts')
}

export async function assignShift(formData: FormData) {
  await requireHrOrAdmin()

  const parsed = assignShiftSchema.safeParse({
    userId: formData.get('userId'),
    shiftId: formData.get('shiftId'),
  })

  if (!parsed.success) {
    redirect('/hrm/attendance/shifts?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from('employee_profiles')
    .update({ shift_id: parsed.data.shiftId || null })
    .eq('user_id', parsed.data.userId)
    .select('user_id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Employee profile not found' : error.message
    redirect('/hrm/attendance/shifts?error=' + encodeURIComponent(message))
  }

  revalidatePath('/hrm/attendance/shifts')
  redirect('/hrm/attendance/shifts')
}
