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
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-slate-800">Role permissions</h1>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <form action={updateModuleAccess} className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_0_rgba(30,41,59,0.06),0_2px_6px_-1px_rgba(30,41,59,0.08)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
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
              <tr key={moduleKey} className="border-b border-slate-100 last:border-0">
                <td className="py-2 capitalize text-slate-700">{moduleKey}</td>
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
        <button
          type="submit"
          className="mt-4 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 active:scale-[0.98] transition-transform"
        >
          Save
        </button>
      </form>
    </div>
  )
}
