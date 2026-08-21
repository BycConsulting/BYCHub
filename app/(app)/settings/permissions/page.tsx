import { requireAdminRole } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { configurableRoles, moduleKeys } from '@/lib/validation'
import { updateModuleAccess } from './actions'

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireAdminRole()
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()
  const { data: rows } = await admin.from('role_module_access').select('role, module, enabled')

  const enabledSet = new Set((rows ?? []).filter((row) => row.enabled).map((row) => `${row.role}:${row.module}`))

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Role permissions</h1>
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      <form action={updateModuleAccess}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="py-2">Module</th>
              <th>Admin</th>
              {configurableRoles.map((role) => (
                <th key={role} className="capitalize">
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {moduleKeys.map((moduleKey) => (
              <tr key={moduleKey} className="border-b">
                <td className="py-2 capitalize">{moduleKey}</td>
                <td>
                  <input type="checkbox" checked disabled />
                </td>
                {configurableRoles.map((role) => (
                  <td key={role}>
                    <input
                      type="checkbox"
                      name="enabled"
                      value={`${role}:${moduleKey}`}
                      defaultChecked={enabledSet.has(`${role}:${moduleKey}`)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <button type="submit" className="mt-4 rounded bg-black px-3 py-2 text-white">
          Save
        </button>
      </form>
    </div>
  )
}
