import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { addHoliday, deleteHoliday } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await requireModule('leave_attendance')
  const { error } = await searchParams
  const canManage = currentUser.role === 'hr' || currentUser.role === 'admin'

  const admin = createAdminSupabaseClient()
  const { data: holidays, error: holidaysError } = await admin
    .from('holidays')
    .select('id, date, name')
    .order('date', { ascending: true })

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/hrm/leave" className="text-sm text-foreground/75 hover:text-foreground hover:underline">
        ← Back to Leave
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Company holidays</h1>
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
      )}

      {canManage && (
        <Card>
          <CardContent>
            <form action={addHoliday} className="flex items-end gap-3">
              <label className="text-sm text-foreground/75">
                Date
                <Input type="date" name="date" required className="mt-1" />
              </label>
              <label className="flex-1 text-sm text-foreground/75">
                Name
                <Input name="name" placeholder="e.g. Independence Day" required className="mt-1 w-full" />
              </label>
              <Button type="submit">Add</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="py-0">
        {holidaysError ? (
          <CardContent className="py-4">
            <p className="text-sm text-destructive">Could not load holidays</p>
          </CardContent>
        ) : holidays && holidays.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                {canManage && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {holidays.map((holiday) => (
                <TableRow key={holiday.id}>
                  <TableCell className="text-foreground/75">{holiday.date}</TableCell>
                  <TableCell className="text-foreground/75">{holiday.name}</TableCell>
                  {canManage && (
                    <TableCell>
                      <form action={deleteHoliday}>
                        <input type="hidden" name="holidayId" value={holiday.id} />
                        <button type="submit" className="text-destructive underline">
                          Delete
                        </button>
                      </form>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">No holidays added yet.</p>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
