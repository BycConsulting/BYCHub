'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/access'
import { INVITE_RESULT_COOKIE } from './invite-result'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { inviteUserSchema } from '@/lib/validation'

function generateTempPassword(): string {
  return Math.random().toString(36).slice(2, 10) + 'A1!'
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
  const cookieStore = await cookies()
  cookieStore.set(INVITE_RESULT_COOKIE, JSON.stringify({ email: parsed.data.email, tempPassword }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/users',
    maxAge: 60,
  })

  revalidatePath('/users')
  redirect('/users')
}

// Clears the one-time invite cookie. A Server Component cannot delete a cookie
// mid-render, so the banner renders with this action wired to its dismiss form.
export async function clearInviteResult() {
  await requireAdmin()
  const cookieStore = await cookies()
  cookieStore.delete({ name: INVITE_RESULT_COOKIE, path: '/users' })
  revalidatePath('/users')
}
