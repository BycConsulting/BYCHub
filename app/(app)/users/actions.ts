'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireAdminRole, requireModule } from '@/lib/access'
import { INVITE_RESULT_COOKIE } from './invite-result'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { deactivateUserSchema, forceDeleteUserSchema, inviteUserSchema, userIdSchema } from '@/lib/validation'

// Math.random() is not cryptographically secure, and this is load-bearing for
// the account-recovery path (reset password), not just first-time invite.
function generateTempPassword(): string {
  return randomBytes(12).toString('base64url') + 'A1!'
}

// 100 years — effectively permanent, and reversible via reactivateUser.
const PERMANENT_BAN_DURATION = '876000h'

async function setInviteResultCookie(email: string, tempPassword: string, action: 'invited' | 'reset') {
  const cookieStore = await cookies()
  cookieStore.set(INVITE_RESULT_COOKIE, JSON.stringify({ email, tempPassword, action }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/users',
    maxAge: 60,
  })
}

export async function inviteUser(formData: FormData) {
  const currentUser = await requireModule('hr')

  const parsed = inviteUserSchema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    role: formData.get('role'),
  })

  if (!parsed.success) {
    redirect('/users?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  if (parsed.data.role === 'admin' && currentUser.role !== 'admin') {
    redirect('/users?error=' + encodeURIComponent('Only an admin can create another admin'))
  }

  const tempPassword = generateTempPassword()
  const admin = createAdminSupabaseClient()

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: tempPassword,
    email_confirm: true,
  })

  if (createError || !created.user) {
    redirect('/users?error=' + encodeURIComponent(createError?.message ?? 'Failed to create user'))
  }

  const { error: profileError } = await admin.from('users').insert({
    id: created.user.id,
    email: parsed.data.email,
    name: parsed.data.name,
    role: parsed.data.role,
  })

  if (profileError) {
    redirect('/users?error=' + encodeURIComponent(profileError.message))
  }

  const { error: employeeProfileError } = await admin.from('employee_profiles').insert({
    user_id: created.user.id,
  })

  if (employeeProfileError) {
    redirect('/users?error=' + encodeURIComponent(employeeProfileError.message))
  }

  // The temp password must never travel in the URL — query strings land in
  // browser history, server access logs and Referer headers. Hand it over in a
  // short-lived httpOnly cookie instead; /users reads it once and clears it.
  await setInviteResultCookie(parsed.data.email, tempPassword, 'invited')

  revalidatePath('/users')
  redirect('/users')
}

// Clears the one-time invite/reset-password cookie. A Server Component cannot
// delete a cookie mid-render, so the banner renders with this action wired to
// its dismiss form.
export async function clearInviteResult() {
  await requireModule('hr')
  const cookieStore = await cookies()
  cookieStore.delete({ name: INVITE_RESULT_COOKIE, path: '/users' })
  revalidatePath('/users')
}

export async function deactivateUser(formData: FormData) {
  const currentUser = await requireModule('hr')

  const parsed = deactivateUserSchema.safeParse({
    userId: formData.get('userId'),
    reassignToUserId: formData.get('reassignToUserId') || undefined,
  })

  if (!parsed.success) {
    redirect('/users?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const { userId, reassignToUserId } = parsed.data

  if (userId === currentUser.id) {
    redirect('/users?error=' + encodeURIComponent('You cannot deactivate your own account'))
  }

  const admin = createAdminSupabaseClient()

  const { data: target } = await admin.from('users').select('role').eq('id', userId).single()

  if (target?.role === 'admin' && currentUser.role !== 'admin') {
    redirect('/users?error=' + encodeURIComponent('Only an admin can deactivate an admin'))
  }

  const supabase = await createClient()

  const { count: leadsCount, error: leadsCountError } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_user_id', userId)

  if (leadsCountError) {
    redirect('/users?error=' + encodeURIComponent(leadsCountError.message))
  }

  const { count: clientsCount, error: clientsCountError } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', userId)

  if (clientsCountError) {
    redirect('/users?error=' + encodeURIComponent(clientsCountError.message))
  }

  const ownedCount = (leadsCount ?? 0) + (clientsCount ?? 0)

  if (ownedCount > 0) {
    if (!reassignToUserId || reassignToUserId === userId) {
      redirect(
        '/users?error=' + encodeURIComponent('Pick a different active employee to reassign their leads/clients to')
      )
    }

    const { data: target } = await admin
      .from('users')
      .select('id, is_active')
      .eq('id', reassignToUserId)
      .single()

    if (!target || !target.is_active) {
      redirect('/users?error=' + encodeURIComponent('Reassignment target must be an active employee'))
    }

    const { error: reassignLeadsError } = await supabase
      .from('leads')
      .update({ assigned_user_id: reassignToUserId })
      .eq('assigned_user_id', userId)

    if (reassignLeadsError) {
      redirect('/users?error=' + encodeURIComponent(reassignLeadsError.message))
    }

    const { error: reassignClientsError } = await supabase
      .from('clients')
      .update({ owner_user_id: reassignToUserId })
      .eq('owner_user_id', userId)

    if (reassignClientsError) {
      redirect('/users?error=' + encodeURIComponent(reassignClientsError.message))
    }
  }

  const { error } = await admin.from('users').update({ is_active: false }).eq('id', userId)

  if (error) {
    redirect('/users?error=' + encodeURIComponent(error.message))
  }

  // Deactivating a manager must not strand their reports' pending leave
  // requests: /hrm/leave and /hrm/leave/requests both route on manager_id, so
  // leaving it pointed at a deactivated manager would make those requests
  // invisible to that manager (who can no longer act on them) and to HR's
  // queue (which excludes anyone with a manager assigned) alike. Clear it so
  // the reports fall back to HR's queue.
  const { error: clearManagerError } = await admin
    .from('employee_profiles')
    .update({ manager_id: null })
    .eq('manager_id', userId)

  if (clearManagerError) {
    redirect('/users?error=' + encodeURIComponent(clearManagerError.message))
  }

  // Flipping is_active locks the employee out of this app and (via
  // 0005_rls_active_employees.sql) out of the REST API too. Their password still
  // authenticates at the Auth layer though, so revoke the credential itself.
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: PERMANENT_BAN_DURATION,
  })

  if (banError) {
    redirect('/users?error=' + encodeURIComponent(banError.message))
  }

  revalidatePath('/users')
  redirect('/users')
}

export async function reactivateUser(formData: FormData) {
  await requireModule('hr')

  const parsed = userIdSchema.safeParse({ userId: formData.get('userId') })

  if (!parsed.success) {
    redirect('/users?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: updated, error } = await admin
    .from('users')
    .update({ is_active: true })
    .eq('id', parsed.data.userId)
    .select('id')
    .single()

  // A well-formed but nonexistent user id matches zero rows, which without
  // `.single()` returns no error at all and redirects as if it had worked.
  // `.single()` surfaces it as PGRST116; its message is unreadable, so
  // translate that one and pass every other error through as-is.
  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'User not found' : error.message
    redirect('/users?error=' + encodeURIComponent(message))
  }

  // deactivateUser bans the Auth user so their password stops working at the
  // Auth layer; restoring the profile has to lift that ban too.
  const { error: unbanError } = await admin.auth.admin.updateUserById(parsed.data.userId, {
    ban_duration: 'none',
  })

  if (unbanError) {
    redirect('/users?error=' + encodeURIComponent(unbanError.message))
  }

  revalidatePath('/users')
  redirect('/users')
}

export async function resetUserPassword(formData: FormData) {
  const currentUser = await requireModule('hr')

  const parsed = userIdSchema.safeParse({ userId: formData.get('userId') })

  if (!parsed.success) {
    redirect('/users?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('users').select('email, role').eq('id', parsed.data.userId).single()

  if (!profile) {
    redirect('/users?error=' + encodeURIComponent('User not found'))
  }

  if (profile.role === 'admin' && currentUser.role !== 'admin') {
    redirect('/users?error=' + encodeURIComponent('Only an admin can reset an admin\'s password'))
  }

  const tempPassword = generateTempPassword()
  const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, { password: tempPassword })

  if (error) {
    redirect('/users?error=' + encodeURIComponent(error.message))
  }

  await setInviteResultCookie(profile.email, tempPassword, 'reset')

  revalidatePath('/users')
  redirect('/users')
}

// Nine "who did this" attribution columns — every one is nullable in the
// schema, so a force-delete can simply clear them. The record they're
// attached to (a lead, a client, a leave request, ...) survives; it just
// loses the note of who assigned/reviewed/started/created/updated it.
const NULLABLE_ATTRIBUTION_CHECKS: { table: string; column: string; label: string }[] = [
  { table: 'leads', column: 'assigned_user_id', label: 'lead(s) assigned to them' },
  { table: 'clients', column: 'owner_user_id', label: 'client(s) owned by them' },
  { table: 'leave_requests', column: 'reviewed_by', label: 'leave request(s) reviewed by them' },
  { table: 'employee_profile_requests', column: 'reviewed_by', label: 'profile-change request(s) reviewed by them' },
  { table: 'onboarding_checklists', column: 'started_by', label: 'onboarding checklist(s) started by them' },
  { table: 'offboarding_checklists', column: 'started_by', label: 'offboarding checklist(s) started by them' },
  { table: 'job_openings', column: 'created_by', label: 'job opening(s) created by them' },
  { table: 'hr_config', column: 'updated_by', label: 'HR configuration they last updated' },
  { table: 'employee_profiles', column: 'manager_id', label: 'report(s) who list them as manager' },
]

// Six "this is their own record" ownership columns — every one is NOT NULL
// in the schema, so it cannot be cleared. A force-delete has no choice but
// to permanently delete these rows along with the account: there is no way
// to keep someone's leave request, attendance record, or activity log entry
// once the user_id it's keyed on no longer exists.
const OWNED_RECORD_CHECKS: { table: string; column: string; label: string }[] = [
  { table: 'activities', column: 'user_id', label: 'activity/activities logged by them' },
  { table: 'leave_requests', column: 'user_id', label: 'leave request(s) filed by them' },
  { table: 'attendance_records', column: 'user_id', label: 'attendance record(s)' },
  { table: 'employee_profile_requests', column: 'user_id', label: 'profile-change request(s) filed by them' },
  { table: 'onboarding_checklists', column: 'user_id', label: 'onboarding checklist(s)' },
  { table: 'offboarding_checklists', column: 'user_id', label: 'offboarding checklist(s)' },
]

// Every table a user row could be entangled in. A hit on any of these blocks
// the plain delete — history must never silently vanish, so an admin has to
// resolve the reference (reassign, reject, edit) — or force-delete — before
// the account can go.
const DELETE_REFERENCE_CHECKS: { table: string; column: string; label: string }[] = [
  ...NULLABLE_ATTRIBUTION_CHECKS,
  ...OWNED_RECORD_CHECKS,
]

export async function deleteUser(formData: FormData) {
  const currentUser = await requireAdminRole()

  const parsed = userIdSchema.safeParse({ userId: formData.get('userId') })

  if (!parsed.success) {
    redirect('/users?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const { userId } = parsed.data

  if (userId === currentUser.id) {
    redirect('/users?error=' + encodeURIComponent('You cannot delete your own account'))
  }

  const admin = createAdminSupabaseClient()

  const { data: target, error: targetError } = await admin
    .from('users')
    .select('is_active')
    .eq('id', userId)
    .single()

  if (targetError && targetError.code !== 'PGRST116') {
    redirect('/users?error=' + encodeURIComponent(targetError.message))
  }

  if (!target) {
    redirect('/users?error=' + encodeURIComponent('User not found'))
  }

  if (target.is_active) {
    redirect('/users?error=' + encodeURIComponent('Deactivate this user before deleting them'))
  }

  const blockers: string[] = []

  for (const check of DELETE_REFERENCE_CHECKS) {
    const { count, error: countError } = await admin
      .from(check.table)
      .select('*', { count: 'exact', head: true })
      .eq(check.column, userId)

    if (countError) {
      redirect('/users?error=' + encodeURIComponent(countError.message))
    }

    if (count && count > 0) {
      blockers.push(`${count} ${check.label}`)
    }
  }

  if (blockers.length > 0) {
    redirect(
      '/users?error=' +
        encodeURIComponent(`Cannot delete: referenced by ${blockers.join(', ')}`) +
        '&blockedUserId=' +
        userId
    )
  }

  const { error: profileDeleteError } = await admin.from('employee_profiles').delete().eq('user_id', userId)

  if (profileDeleteError) {
    redirect('/users?error=' + encodeURIComponent(profileDeleteError.message))
  }

  const { error: userDeleteError } = await admin.from('users').delete().eq('id', userId)

  if (userDeleteError) {
    redirect('/users?error=' + encodeURIComponent(userDeleteError.message))
  }

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId)

  if (authDeleteError) {
    redirect('/users?error=' + encodeURIComponent(authDeleteError.message))
  }

  revalidatePath('/users')
  redirect('/users')
}

// Escalation from deleteUser's block: an admin who has already seen exactly
// what's blocking a plain delete (the error banner names every table/count)
// can choose to permanently delete the account anyway. Nullable attribution
// columns are cleared; NOT-NULL ownership columns are deleted along with the
// account — there is no way to keep a leave request, attendance record, or
// activity log entry once the user_id it's keyed on stops existing.
export async function forceDeleteUser(formData: FormData) {
  const currentUser = await requireAdminRole()

  const parsed = forceDeleteUserSchema.safeParse({
    userId: formData.get('userId'),
    acknowledged: formData.get('acknowledged'),
  })

  if (!parsed.success) {
    redirect('/users?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const { userId } = parsed.data

  if (userId === currentUser.id) {
    redirect('/users?error=' + encodeURIComponent('You cannot delete your own account'))
  }

  const admin = createAdminSupabaseClient()

  const { data: target, error: targetError } = await admin
    .from('users')
    .select('is_active')
    .eq('id', userId)
    .single()

  if (targetError && targetError.code !== 'PGRST116') {
    redirect('/users?error=' + encodeURIComponent(targetError.message))
  }

  if (!target) {
    redirect('/users?error=' + encodeURIComponent('User not found'))
  }

  if (target.is_active) {
    redirect('/users?error=' + encodeURIComponent('Deactivate this user before deleting them'))
  }

  for (const check of NULLABLE_ATTRIBUTION_CHECKS) {
    const clearPayload: Record<string, null> = {}
    clearPayload[check.column] = null

    // Supabase's generated types resolve .update()'s payload to `never` when
    // .from() is called with a dynamic (non-literal) table name — the same
    // dynamic-table pattern .select()/.delete()/.eq() already use freely
    // elsewhere in this function, but write-payload typing can't be unified
    // across tables with different column shapes.
    const { error: clearError } = await admin
      .from(check.table)
      .update(clearPayload as never)
      .eq(check.column, userId)

    if (clearError) {
      redirect('/users?error=' + encodeURIComponent(clearError.message))
    }
  }

  for (const check of OWNED_RECORD_CHECKS) {
    const { error: purgeError } = await admin.from(check.table).delete().eq(check.column, userId)

    if (purgeError) {
      redirect('/users?error=' + encodeURIComponent(purgeError.message))
    }
  }

  const { error: profileDeleteError } = await admin.from('employee_profiles').delete().eq('user_id', userId)

  if (profileDeleteError) {
    redirect('/users?error=' + encodeURIComponent(profileDeleteError.message))
  }

  const { error: userDeleteError } = await admin.from('users').delete().eq('id', userId)

  if (userDeleteError) {
    redirect('/users?error=' + encodeURIComponent(userDeleteError.message))
  }

  const { error: authDeleteError2 } = await admin.auth.admin.deleteUser(userId)

  if (authDeleteError2) {
    redirect('/users?error=' + encodeURIComponent(authDeleteError2.message))
  }

  revalidatePath('/users')
  redirect('/users')
}
