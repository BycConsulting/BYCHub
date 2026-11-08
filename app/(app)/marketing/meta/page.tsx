import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createReport } from '../../clients/[id]/reports/actions'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormSelect } from '@/components/ui/form-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function MetaReportsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireModule('clients')
  const { error } = await searchParams
  const supabase = await createClient()

  const [{ data: clients }, { data: accounts }, { data: reports }] = await Promise.all([
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('client_ad_accounts').select('client_id, ad_account_id, label').order('created_at'),
    supabase
      .from('report_layouts')
      .select('id, client_id, name, ad_account_id, updated_at')
      .order('updated_at', { ascending: false }),
  ])

  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]))
  const targetOptions = (accounts ?? []).map((a) => ({
    value: `${a.client_id}|${a.ad_account_id}`,
    label: `${clientName.get(a.client_id) ?? 'Client'} — ${a.label || a.ad_account_id}`,
  }))

  return (
    <div className="space-y-6">
      <PageHeader title="Meta reports" description="Live Meta Ads reports for every client. Open one to refresh data, edit the layout or export a PDF." />

      {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New report</CardTitle>
        </CardHeader>
        <CardContent>
          {targetOptions.length > 0 ? (
            <form action={createReport} className="flex flex-wrap items-center gap-2">
              <FormSelect name="target" options={targetOptions} defaultValue={targetOptions[0].value} className="w-80" />
              <Button type="submit">
                <Plus /> Create from standard template
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              No ad accounts yet. <Link href="/marketing/ad-accounts" className="font-medium text-primary underline">Add one first</Link>.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Report</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Ad account</TableHead>
              <TableHead>Last edited</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(reports ?? []).map((report) => (
              <TableRow key={report.id}>
                <TableCell>
                  <Link href={`/clients/${report.client_id}/reports/${report.id}`} className="font-medium text-foreground hover:underline">
                    {report.name}
                  </Link>
                </TableCell>
                <TableCell>{clientName.get(report.client_id) ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{report.ad_account_id}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(report.updated_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
            {(reports ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  No reports yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
