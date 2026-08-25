'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { updateHrConfigSchema } from '@/lib/validation'

export async function updateHrConfig(formData: FormData) {
  const currentUser = await requireModule('hr')

  const parsed = updateHrConfigSchema.safeParse({
    workingMonday: formData.get('workingMonday') === 'on',
    workingTuesday: formData.get('workingTuesday') === 'on',
    workingWednesday: formData.get('workingWednesday') === 'on',
    workingThursday: formData.get('workingThursday') === 'on',
    workingFriday: formData.get('workingFriday') === 'on',
    workingSaturday: formData.get('workingSaturday') === 'on',
    casualLeaveDays: formData.get('casualLeaveDays'),
    sickLeaveDays: formData.get('sickLeaveDays'),
    earnedLeaveDays: formData.get('earnedLeaveDays'),
    maternityLeaveDays: formData.get('maternityLeaveDays'),
    paternityLeaveDays: formData.get('paternityLeaveDays'),
    officeIpAllowlist: formData.get('officeIpAllowlist'),
  })

  if (!parsed.success) {
    redirect('/users/config?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from('hr_config')
    .update({
      working_monday: parsed.data.workingMonday,
      working_tuesday: parsed.data.workingTuesday,
      working_wednesday: parsed.data.workingWednesday,
      working_thursday: parsed.data.workingThursday,
      working_friday: parsed.data.workingFriday,
      working_saturday: parsed.data.workingSaturday,
      casual_leave_days: parsed.data.casualLeaveDays,
      sick_leave_days: parsed.data.sickLeaveDays,
      earned_leave_days: parsed.data.earnedLeaveDays,
      maternity_leave_days: parsed.data.maternityLeaveDays,
      paternity_leave_days: parsed.data.paternityLeaveDays,
      office_ip_allowlist: parsed.data.officeIpAllowlist,
      updated_at: new Date().toISOString(),
      updated_by: currentUser.id,
    })
    .eq('id', true)
    .select('id')
    .single()

  // The singleton row always exists once Task 1's migration has run — a
  // zero-row update here almost always means the migration hasn't been run
  // yet, not a real "not found" case. Surface that possibility rather than
  // a bare error, matching the diagnostic-visibility lesson from the prior
  // sub-project's final review (silent failures there caused a full,
  // unexplained lockout).
  if (!updated) {
    const message =
      !error || error.code === 'PGRST116'
        ? 'HR configuration not found — has the 0008_hr_config migration been run?'
        : error.message
    redirect('/users/config?error=' + encodeURIComponent(message))
  }

  revalidatePath('/users/config')
  redirect('/users/config')
}
