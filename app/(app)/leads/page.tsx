import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createLead } from './actions'
import { requireModule } from '@/lib/access'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('leads')
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('id, contact_name, contact_company, stage, source, created_at')
    .order('created_at', { ascending: false })

  if (leadsError) {
    console.error('[leads] failed to load leads list', leadsError)
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">New lead</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
          )}
          <form action={createLead} className="grid grid-cols-2 gap-3">
            <Input name="contact_name" placeholder="Contact name" required />
            <Input name="contact_email" placeholder="Email" />
            <Input name="contact_company" placeholder="Company" />
            <Input name="source" placeholder="Source" />
            <Textarea name="notes" placeholder="Notes" className="col-span-2" />
            <Button type="submit" className="col-span-2">
              Add lead
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardHeader className="pt-4">
          <CardTitle className="text-lg">Leads</CardTitle>
        </CardHeader>
        {leadsError && (
          <p className="mx-4 mb-4 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            Failed to load leads: {leadsError.message}
          </p>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contact</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(leads ?? []).map((lead) => (
              <TableRow key={lead.id}>
                <TableCell>
                  <Link href={`/leads/${lead.id}`} className="font-medium text-slate-800 hover:underline">
                    {lead.contact_name}
                  </Link>
                </TableCell>
                <TableCell className="text-slate-600">{lead.contact_company ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {lead.stage}
                  </Badge>
                </TableCell>
                <TableCell className="text-slate-600">{lead.source ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
