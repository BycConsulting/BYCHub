import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const [, , email, name, password] = process.argv

if (!url || !serviceKey || !email || !name || !password) {
  console.error('Usage: node --env-file=.env.local scripts/seed-admin.mjs <email> <name> <password>')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
})

if (createError || !created.user) {
  console.error('Failed to create auth user:', createError?.message)
  process.exit(1)
}

const { error: profileError } = await admin.from('users').insert({
  id: created.user.id,
  email,
  name,
  role: 'admin',
})

if (profileError) {
  console.error('Failed to create profile row:', profileError.message)
  process.exit(1)
}

console.log(`Admin user created: ${email}`)
