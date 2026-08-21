'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { configurableRoles, moduleKeys, updateModuleAccessSchema } from '@/lib/validation'
import type { ConfigurableRole, Module } from '@/types/database'

function isConfigurableRole(value: string): value is ConfigurableRole {
  return (configurableRoles as readonly string[]).includes(value)
}

function isModule(value: string): value is Module {
  return (moduleKeys as readonly string[]).includes(value)
}

export async function updateModuleAccess(formData: FormData) {
  await requireModule('settings')

  const parsed = updateModuleAccessSchema.safeParse({
    enabled: formData.getAll('enabled'),
  })

  if (!parsed.success) {
    redirect('/settings/permissions?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const enabledPairs = new Set(
    parsed.data.enabled.filter((pair) => {
      const [role, moduleKey] = pair.split(':')
      return role !== undefined && moduleKey !== undefined && isConfigurableRole(role) && isModule(moduleKey)
    })
  )

  const rows = configurableRoles.flatMap((role) =>
    moduleKeys.map((moduleKey) => ({
      role,
      module: moduleKey,
      enabled: enabledPairs.has(`${role}:${moduleKey}`),
    }))
  )

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('role_module_access').upsert(rows, { onConflict: 'role,module' })

  if (error) {
    redirect('/settings/permissions?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/settings/permissions')
  redirect('/settings/permissions')
}
