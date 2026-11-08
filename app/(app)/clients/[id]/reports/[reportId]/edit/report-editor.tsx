'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import ReactGridLayout, { noCompactor, useContainerWidth } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { GripHorizontal, Plus, Settings2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/ui/form-select'
import { ReportWidget } from '@/components/report/widgets'
import { applyLayout, defaultWidget, newWidgetId, placeNewWidget } from '@/lib/meta/editing'
import { GRID_COLUMNS, PAGE_SIZE_PX, ROW_HEIGHT_PX, pageRows, widgetTypes, type Orientation, type Page, type WidgetConfig, type WidgetType } from '@/lib/meta/layout'
import { saveReport } from '../../actions'
import { WidgetConfigDialog } from './widget-config-dialog'

const TYPE_LABELS: Record<WidgetType, string> = {
  kpi: 'KPI',
  line: 'Line',
  bar: 'Bar',
  donut: 'Donut',
  table: 'Table',
  text: 'Text',
}

function PageEditor({
  page,
  orientation,
  onLayout,
  onEdit,
  onDelete,
}: {
  page: Page
  orientation: Orientation
  onLayout: (items: { i: string; x: number; y: number; w: number; h: number }[]) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}) {
  const { width, height } = PAGE_SIZE_PX[orientation]
  const { containerRef, mounted } = useContainerWidth()

  return (
    <div className="overflow-x-auto rounded-xl shadow-md ring-1 ring-border">
      <div ref={containerRef} className="bg-white" style={{ width, height, backgroundImage: 'linear-gradient(to right, #eef1f8 1px, transparent 1px)', backgroundSize: `${width / GRID_COLUMNS}px 100%` }}>
        {mounted && (
          <ReactGridLayout
            width={width}
            layout={page.map((w) => ({ i: w.id, x: w.x, y: w.y, w: w.w, h: w.h }))}
            gridConfig={{ cols: GRID_COLUMNS, rowHeight: ROW_HEIGHT_PX, margin: [0, 0], containerPadding: [0, 0], maxRows: pageRows(orientation) }}
            dragConfig={{ handle: '.drag-handle' }}
            compactor={noCompactor}
            onLayoutChange={(layout) => onLayout(layout.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h })))}
          >
            {page.map((widget) => (
              <div key={widget.id} className="group relative">
                <ReportWidget widget={widget} data={undefined} />
                <div className="absolute top-1.5 right-1.5 left-1.5 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="drag-handle flex flex-1 cursor-grab items-center justify-center rounded-md bg-primary/90 py-0.5 text-primary-foreground">
                    <GripHorizontal className="h-3.5 w-3.5" />
                  </div>
                  <button type="button" onClick={() => onEdit(widget.id)} className="rounded-md bg-primary/90 p-1 text-primary-foreground" aria-label="Edit widget">
                    <Settings2 className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => onDelete(widget.id)} className="rounded-md bg-destructive p-1 text-white" aria-label="Delete widget">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </ReactGridLayout>
        )}
      </div>
    </div>
  )
}

export function ReportEditor({
  layoutId,
  clientId,
  initialName,
  initialOrientation,
  initialPages,
}: {
  layoutId: string
  clientId: string
  initialName: string
  initialOrientation: Orientation
  initialPages: Page[]
}) {
  const [name, setName] = useState(initialName)
  const [orientation, setOrientation] = useState<Orientation>(initialOrientation)
  const [pages, setPages] = useState<Page[]>(initialPages)
  const [editing, setEditing] = useState<{ page: number; id: string } | null>(null)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [saving, startSave] = useTransition()

  const editingWidget = editing ? pages[editing.page]?.find((w) => w.id === editing.id) ?? null : null

  function setPage(index: number, next: Page) {
    setPages((current) => current.map((p, i) => (i === index ? next : p)))
  }

  function addWidget(pageIndex: number, type: WidgetType) {
    const placed = placeNewWidget(pages[pageIndex], orientation, defaultWidget(type, newWidgetId(pages)))
    if (!placed) {
      setMessage({ kind: 'error', text: 'No room left on that page — remove something or add a page.' })
      return
    }
    setMessage(null)
    setPage(pageIndex, placed)
  }

  function save() {
    startSave(async () => {
      const result = await saveReport(layoutId, name, orientation, pages)
      setMessage(result.error ? { kind: 'error', text: result.error } : { kind: 'ok', text: 'Saved.' })
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="w-64" aria-label="Report name" />
        <FormSelect
          name="orientation"
          options={[
            { value: 'landscape', label: 'Landscape A4' },
            { value: 'portrait', label: 'Portrait A4' },
          ]}
          defaultValue={orientation}
          onValueChange={(v) => setOrientation(v as Orientation)}
          className="w-44"
        />
        <Button variant="outline" onClick={() => setPages((p) => [...p, []])}>
          <Plus /> Add page
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {message && <span className={`text-sm ${message.kind === 'error' ? 'text-destructive' : 'text-success'}`}>{message.text}</span>}
          <Button asChild variant="outline">
            <Link href={`/clients/${clientId}/reports/${layoutId}`}>Back to report</Link>
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {pages.map((page, index) => (
        <div key={index} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">Page {index + 1}</span>
            {widgetTypes.map((type) => (
              <Button key={type} size="sm" variant="outline" onClick={() => addWidget(index, type)}>
                <Plus /> {TYPE_LABELS[type]}
              </Button>
            ))}
            {pages.length > 1 && (
              <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => setPages((p) => p.filter((_, i) => i !== index))}>
                Remove page
              </Button>
            )}
          </div>
          <PageEditor
            page={page}
            orientation={orientation}
            onLayout={(items) =>
              setPages((current) => {
                const next = current.map((p, i) => (i === index ? applyLayout(p, items) : p))
                return next.every((p, i) => p === current[i]) ? current : next
              })
            }
            onEdit={(id) => setEditing({ page: index, id })}
            onDelete={(id) => setPage(index, page.filter((w) => w.id !== id))}
          />
        </div>
      ))}

      <WidgetConfigDialog
        widget={editingWidget}
        onClose={() => setEditing(null)}
        onSave={(config: WidgetConfig) => {
          if (editing) setPage(editing.page, pages[editing.page].map((w) => (w.id === editing.id ? { ...w, config } : w)))
          setEditing(null)
        }}
      />
    </div>
  )
}
