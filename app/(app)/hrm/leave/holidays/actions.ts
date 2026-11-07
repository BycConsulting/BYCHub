'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { addHolidaySchema, holidayIdSchema } from '@/lib/validation'

function isHrOrAdmin(role: string): boolean {
  return role === 'hr' || role === 'admin'
}

export async function addHoliday(formData: FormData) {
  const currentUser = await requireModule('leave_attendance')
  if (!isHrOrAdmin(currentUser.role)) {
    redirect('/hrm/leave/holidays?error=' + encodeURIComponent('Not authorized'))
  }

  const parsed = addHolidaySchema.safeParse({
    date: formData.get('date'),
    name: formData.get('name'),
  })

  if (!parsed.success) {
    redirect('/hrm/leave/holidays?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('holidays').insert({ date: parsed.data.date, name: parsed.data.name })

  if (error) {
    const message = error.code === '23505' ? 'A holiday already exists on this date' : error.message
    redirect('/hrm/leave/holidays?error=' + encodeURIComponent(message))
  }

  revalidatePath('/hrm/leave/holidays')
  redirect('/hrm/leave/holidays')
}

export async function deleteHoliday(formData: FormData) {
  const currentUser = await requireModule('leave_attendance')
  if (!isHrOrAdmin(currentUser.role)) {
    redirect('/hrm/leave/holidays?error=' + encodeURIComponent('Not authorized'))
  }

  const parsed = holidayIdSchema.safeParse({ holidayId: formData.get('holidayId') })

  if (!parsed.success) {
    redirect('/hrm/leave/holidays?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: deleted, error } = await admin
    .from('holidays')
    .delete()
    .eq('id', parsed.data.holidayId)
    .select('id')
    .single()

  if (!deleted) {
    const message = !error || error.code === 'PGRST116' ? 'Holiday not found' : error.message
    redirect('/hrm/leave/holidays?error=' + encodeURIComponent(message))
  }

  revalidatePath('/hrm/leave/holidays')
  redirect('/hrm/leave/holidays')
}
