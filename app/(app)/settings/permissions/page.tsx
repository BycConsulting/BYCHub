import { requireAdminRole } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { configurableRoles, moduleKeys } from '@/lib/validation'
import { updateModuleAccess } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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

      <Card>
        <CardContent>
          <form action={updateModuleAccess}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  <TableHead>Admin</TableHead>
                  {configurableRoles.map((role) => (
                    <TableHead key={role} className="capitalize">
                      {role}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {moduleKeys.map((moduleKey) => (
                  <TableRow key={moduleKey}>
                    <TableCell className="capitalize text-slate-700">{moduleKey}</TableCell>
                    <TableCell>
                      <input type="checkbox" checked disabled className="accent-slate-800" />
                    </TableCell>
                    {configurableRoles.map((role) => (
                      <TableCell key={role}>
                        <input
                          type="checkbox"
                          name="enabled"
                          value={`${role}:${moduleKey}`}
                          defaultChecked={enabledSet.has(`${role}:${moduleKey}`)}
                          className="accent-slate-800"
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button type="submit" className="mt-4">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
