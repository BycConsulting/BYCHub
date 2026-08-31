import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { addCandidate } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const STAGE_LABELS: Record<string, string> = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
}

export default async function OpeningDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ openingId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('recruitment')
  const { openingId } = await params
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: opening, error: openingError } = await admin
    .from('job_openings')
    .select('id, title, department, status')
    .eq('id', openingId)
    .single()

  if (openingError && openingError.code !== 'PGRST116') {
    throw new Error(`Could not load job opening: ${openingError.message}`)
  }

  if (!opening) notFound()

  const { data: candidates, error: candidatesError } = await admin
    .from('candidates')
    .select('id, name, email, stage, applied_at')
    .eq('opening_id', openingId)
    .order('applied_at', { ascending: false })

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/hrm/recruitment" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to Recruitment
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-slate-800">{opening.title}</h1>
        <p className="text-sm text-slate-500">
          {opening.department || '—'} · {opening.status}
        </p>
      </div>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <Card>
        <CardContent>
          <form action={addCandidate} className="space-y-3">
            <input type="hidden" name="openingId" value={opening.id} />
            <div className="grid grid-cols-2 gap-3">
              <Input name="name" placeholder="Name" required />
              <Input name="email" placeholder="Email" />
              <Input name="phone" placeholder="Phone" />
              <Input name="resumeNotes" placeholder="Resume link or notes" />
            </div>
            <Button type="submit">Add candidate</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardHeader className="pt-4">
          <CardTitle className="text-lg">Candidates</CardTitle>
        </CardHeader>
        {candidatesError ? (
          <CardContent className="pb-4">
            <p className="text-sm text-red-700">Could not load candidates</p>
          </CardContent>
        ) : candidates && candidates.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Stage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((candidate) => (
                <TableRow key={candidate.id}>
                  <TableCell>
                    <Link
                      href={`/hrm/recruitment/candidates/${candidate.id}`}
                      className="font-medium text-slate-800 hover:underline"
                    >
                      {candidate.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-500">{STAGE_LABELS[candidate.stage]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardContent className="pb-4">
            <p className="text-sm text-slate-500">No candidates yet.</p>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
