import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createOpening, toggleOpeningStatus } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function RecruitmentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('recruitment')
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: openings, error: openingsError } = await admin
    .from('job_openings')
    .select('id, title, department, status, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Recruitment</h1>
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
      )}

      <Card>
        <CardContent>
          <form action={createOpening} className="flex items-end gap-3">
            <label className="flex-1 text-sm text-foreground/75">
              Title
              <Input name="title" required className="mt-1 w-full" />
            </label>
            <label className="flex-1 text-sm text-foreground/75">
              Department
              <Input name="department" className="mt-1 w-full" />
            </label>
            <Button type="submit">Create</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardHeader className="pt-4">
          <CardTitle className="text-lg">Job Openings</CardTitle>
        </CardHeader>
        {openingsError ? (
          <CardContent className="pb-4">
            <p className="text-sm text-destructive">Could not load job openings</p>
          </CardContent>
        ) : openings && openings.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {openings.map((opening) => (
                <TableRow key={opening.id}>
                  <TableCell>
                    <Link
                      href={`/hrm/recruitment/${opening.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {opening.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-foreground/75">{opening.department || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={opening.status === 'open' ? 'default' : 'secondary'}>{opening.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <form action={toggleOpeningStatus}>
                      <input type="hidden" name="openingId" value={opening.id} />
                      <input type="hidden" name="status" value={opening.status === 'open' ? 'closed' : 'open'} />
                      <button type="submit" className="text-foreground/75 underline hover:text-foreground">
                        {opening.status === 'open' ? 'Close' : 'Reopen'}
                      </button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardContent className="pb-4">
            <p className="text-sm text-muted-foreground">No job openings yet.</p>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
