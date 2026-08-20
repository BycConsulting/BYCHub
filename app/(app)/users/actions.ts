'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/access'
import { INVITE_RESULT_COOKIE } from './invite-result'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { deactivateUserSchema, inviteUserSchema, userIdSchema } from '@/lib/validation'

function generateTempPassword(): string {
  return Math.random().toString(36).slice(2, 10) + 'A1!'
}

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
  await requireAdmin()

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
  await requireAdmin()
  const cookieStore = await cookies()
  cookieStore.delete({ name: INVITE_RESULT_COOKIE, path: '/users' })
  revalidatePath('/users')
}

export async function deactivateUser(formData: FormData) {
  const currentUser = await requireAdmin()

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

  const { count: leadsCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_user_id', userId)

  const { count: clientsCount } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', userId)

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

    await supabase.from('leads').update({ assigned_user_id: reassignToUserId }).eq('assigned_user_id', userId)
    await supabase.from('clients').update({ owner_user_id: reassignToUserId }).eq('owner_user_id', userId)
  }

  const { error } = await admin.from('users').update({ is_active: false }).eq('id', userId)

  if (error) {
    redirect('/users?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/users')
  redirect('/users')
}

export async function reactivateUser(formData: FormData) {
  await requireAdmin()

  const parsed = userIdSchema.safeParse({ userId: formData.get('userId') })

  if (!parsed.success) {
    redirect('/users?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('users').update({ is_active: true }).eq('id', parsed.data.userId)

  if (error) {
    redirect('/users?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/users')
  redirect('/users')
}

export async function resetUserPassword(formData: FormData) {
  await requireAdmin()

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
