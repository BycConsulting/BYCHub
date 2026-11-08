import Link from 'next/link'
import { createReport } from './reports/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormSelect } from '@/components/ui/form-select'

export function MetaReports({
  clientId,
  accounts,
  reports,
}: {
  clientId: string
  accounts: { ad_account_id: string; label: string }[]
  reports: { id: string; name: string; ad_account_id: string; updated_at: string }[]
}) {
  const accountOptions = accounts.map((a) => ({
    value: a.ad_account_id,
    label: a.label ? `${a.ad_account_id} — ${a.label}` : a.ad_account_id,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Meta Ads reports</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {reports.map((report) => (
            <li key={report.id} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
              <Link href={`/clients/${clientId}/reports/${report.id}`} className="font-medium text-foreground hover:underline">
                {report.name}
              </Link>
              <span className="text-xs text-muted-foreground">
                {report.ad_account_id} · edited {new Date(report.updated_at).toLocaleDateString()}
              </span>
            </li>
          ))}
          {reports.length === 0 && <li className="text-sm text-muted-foreground">No reports yet.</li>}
        </ul>

        {accounts.length > 0 ? (
          <form action={createReport} className="mt-4 flex flex-wrap items-center gap-2">
            <input type="hidden" name="clientId" value={clientId} />
            <FormSelect name="adAccountId" options={accountOptions} defaultValue={accountOptions[0].value} className="w-72" />
            <Button type="submit" variant="outline">
              New Meta report
            </Button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Map an ad account above to create a report.</p>
        )}
      </CardContent>
    </Card>
  )
}
