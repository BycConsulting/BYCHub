'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { INVITE_RESULT_COOKIE } from './invite-result'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { deactivateUserSchema, inviteUserSchema, userIdSchema } from '@/lib/validation'

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
  await requireModule('hr')

  const parsed = inviteUserSchema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    role: formData.get('role'),
  })

  if (!parsed.success) {
    redirect('/users?error=' + encodeURIComponent(parsed.error.issues[0].message))
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

  const supabase = await createClient()
  const admin = createAdminSupabaseClient()

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
  await requireModule('hr')

  const parsed = userIdSchema.safeParse({ userId: formData.get('userId') })

  if (!parsed.success) {
    redirect('/users?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin.from('users').select('email').eq('id', parsed.data.userId).single()

  if (!profile) {
    redirect('/users?error=' + encodeURIComponent('User not found'))
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
