import { notFound } from 'next/navigation'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { pagesSchemaFor } from '@/lib/meta/layout'
import { PageHeader } from '@/components/page-header'
import { ReportEditor } from './report-editor'

export default async function EditReportPage({ params }: { params: Promise<{ id: string; reportId: string }> }) {
  await requireModule('clients')
  const { id, reportId } = await params
  const supabase = await createClient()

  const { data: layout } = await supabase
    .from('report_layouts')
    .select('id, name, orientation, pages')
    .eq('id', reportId)
    .eq('client_id', id)
    .single()

  if (!layout) notFound()

  const pages = pagesSchemaFor(layout.orientation).safeParse(layout.pages)

  return (
    <div className="space-y-5">
      <PageHeader title="Edit report" description="Drag widgets by their top bar, resize from the corner, then save." />
      {pages.success ? (
        <ReportEditor
          layoutId={layout.id}
          clientId={id}
          initialName={layout.name}
          initialOrientation={layout.orientation}
          initialPages={pages.data}
        />
      ) : (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          This report layout is invalid and cannot be edited.
        </p>
      )}
    </div>
  )
}
