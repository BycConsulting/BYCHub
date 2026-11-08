import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Download, RefreshCw } from 'lucide-react'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { loadReportData } from '@/lib/meta/report-data'
import { PAGE_SIZE_PX, pagesSchemaFor } from '@/lib/meta/layout'
import { presetRange, type RangePreset } from '@/lib/meta/ranges'
import { todayISO } from '@/lib/task-form-data'
import { PageCanvas } from '@/components/report/page-canvas'
import { FitToWidth } from '@/components/report/fit-to-width'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { refreshReport } from '../actions'

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'last_7', label: 'Last 7 days' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'this_week', label: 'This week' },
  { value: 'last_week', label: 'Last week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
]

const DATE = /^\d{4}-\d{2}-\d{2}$/

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; reportId: string }>
  searchParams: Promise<{ from?: string; to?: string; compare?: string; error?: string }>
}) {
  await requireModule('clients')
  const { id, reportId } = await params
  const { from, to, compare: compareParam, error } = await searchParams
  const supabase = await createClient()

  const { data: layout } = await supabase
    .from('report_layouts')
    .select('id, client_id, name, ad_account_id, orientation, pages')
    .eq('id', reportId)
    .eq('client_id', id)
    .single()

  if (!layout) notFound()

  const { data: client } = await supabase.from('clients').select('name').eq('id', id).single()

  const today = todayISO()
  const range =
    from && to && DATE.test(from) && DATE.test(to) && from <= to ? { from, to } : presetRange('last_30', today)
  const compare = compareParam === '1'

  const parsedPages = pagesSchemaFor(layout.orientation).safeParse(layout.pages)
  const pages = parsedPages.success ? parsedPages.data : []
  const data = await loadReportData(layout.id, layout.ad_account_id, pages, range, compare)

  const fetchedTimes = Object.values(data)
    .filter((d) => d !== undefined)
    .map((d) => d!.fetchedAt)
    .sort()
  const lastUpdated = fetchedTimes.length > 0 ? new Date(fetchedTimes[fetchedTimes.length - 1]).toLocaleString() : null

  const query = (r: { from: string; to: string }, c = compare) =>
    `?from=${r.from}&to=${r.to}${c ? '&compare=1' : ''}`
  const base = `/clients/${id}/reports/${reportId}`
  const { width, height } = PAGE_SIZE_PX[layout.orientation]

  return (
    <div className="space-y-5">
      <PageHeader
        title={layout.name}
        description={`${client?.name ?? 'Client'} · ${layout.ad_account_id} · ${range.from} → ${range.to}`}
        actions={
          <>
            <form action={refreshReport}>
              <input type="hidden" name="layoutId" value={layout.id} />
              <input type="hidden" name="clientId" value={id} />
              <input type="hidden" name="from" value={range.from} />
              <input type="hidden" name="to" value={range.to} />
              <input type="hidden" name="compare" value={compare ? '1' : '0'} />
              <Button type="submit" variant="outline">
                <RefreshCw /> Refresh
              </Button>
            </form>
            <Button asChild>
              <Link href={`${base}/print${query(range)}`} target="_blank">
                <Download /> Export PDF
              </Link>
            </Button>
          </>
        }
      />

      {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
        {PRESETS.map((p) => {
          const r = presetRange(p.value, today)
          const active = r.from === range.from && r.to === range.to
          return (
            <Link
              key={p.value}
              href={`${base}${query(r)}`}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${active ? 'bg-primary text-primary-foreground' : 'text-foreground/70 hover:bg-muted'}`}
            >
              {p.label}
            </Link>
          )
        })}
        <form className="ml-auto flex flex-wrap items-center gap-2">
          <Input type="date" name="from" defaultValue={range.from} className="w-auto" />
          <Input type="date" name="to" defaultValue={range.to} className="w-auto" />
          <label className="flex items-center gap-1.5 text-sm text-foreground/75">
            <input type="checkbox" name="compare" value="1" defaultChecked={compare} className="accent-primary" />
            vs previous period
          </label>
          <Button type="submit" variant="outline">
            Apply
          </Button>
        </form>
      </div>

      <p className="text-xs text-muted-foreground">
        {lastUpdated ? `Last updated ${lastUpdated}` : 'No data yet for this range — press Refresh to fetch it from Meta.'}
      </p>

      {!parsedPages.success && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          This report layout is invalid and cannot be shown.
        </p>
      )}

      <div className="space-y-6">
        {pages.map((page, i) => (
          <div key={i} className="overflow-hidden rounded-xl shadow-md ring-1 ring-border">
            <FitToWidth width={width} height={height}>
              <PageCanvas orientation={layout.orientation} page={page} data={data} />
            </FitToWidth>
          </div>
        ))}
      </div>
    </div>
  )
}
