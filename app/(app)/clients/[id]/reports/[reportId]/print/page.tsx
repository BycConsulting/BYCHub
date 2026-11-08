import { notFound } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { loadReportData } from '@/lib/meta/report-data'
import { PAGE_SIZE_PX, pagesSchemaFor } from '@/lib/meta/layout'
import { presetRange } from '@/lib/meta/ranges'
import { todayISO } from '@/lib/task-form-data'
import { PageCanvas } from '@/components/report/page-canvas'
import { PrintTrigger } from './print-trigger'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export default async function PrintReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; reportId: string }>
  searchParams: Promise<{ from?: string; to?: string; compare?: string }>
}) {
  await requireModule('clients')
  const { id, reportId } = await params
  const { from, to, compare: compareParam } = await searchParams
  const supabase = await createClient()

  const { data: layout } = await supabase
    .from('report_layouts')
    .select('id, ad_account_id, orientation, pages')
    .eq('id', reportId)
    .eq('client_id', id)
    .single()

  if (!layout) notFound()

  const range =
    from && to && DATE.test(from) && DATE.test(to) && from <= to ? { from, to } : presetRange('last_30', todayISO())
  const pages = pagesSchemaFor(layout.orientation).safeParse(layout.pages)
  if (!pages.success) notFound()

  const data = await loadReportData(layout.id, layout.ad_account_id, pages.data, range, compareParam === '1')
  const { width, height } = PAGE_SIZE_PX[layout.orientation]

  return (
    <div>
      <style>{`@page { size: A4 ${layout.orientation}; margin: 0 } @media print { body { background: #fff !important } }`}</style>
      <PrintTrigger />
      {pages.data.map((page, i) => (
        <div
          key={i}
          className="mb-6 overflow-hidden shadow-md ring-1 ring-border print:mb-0 print:shadow-none print:ring-0"
          style={{ width, height, breakAfter: i < pages.data.length - 1 ? 'page' : 'auto' }}
        >
          <PageCanvas orientation={layout.orientation} page={pages.data[i]} data={data} />
        </div>
      ))}
    </div>
  )
}
