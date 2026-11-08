'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormSelect } from '@/components/ui/form-select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { buildConfig } from '@/lib/meta/editing'
import { METRIC_CATALOG } from '@/lib/meta/metrics'
import type { Widget, WidgetConfig } from '@/lib/meta/layout'
import type { Breakdown, InsightLevel } from '@/lib/meta/query'

const LEVELS: { value: InsightLevel; label: string }[] = [
  { value: 'campaign', label: 'Campaigns' },
  { value: 'adset', label: 'Ad sets' },
  { value: 'ad', label: 'Ads' },
]

const BREAKDOWNS: { value: Breakdown; label: string }[] = [
  { value: 'publisher_platform', label: 'Platform' },
  { value: 'platform_position', label: 'Placement' },
  { value: 'age', label: 'Age' },
  { value: 'gender', label: 'Gender' },
  { value: 'country', label: 'Country' },
]

export function WidgetConfigDialog({
  widget,
  onClose,
  onSave,
}: {
  widget: Widget | null
  onClose: () => void
  onSave: (config: WidgetConfig) => void
}) {
  return (
    <Dialog open={!!widget} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {widget && <ConfigForm key={widget.id} widget={widget} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  )
}

function ConfigForm({ widget, onSave }: { widget: Widget; onSave: (config: WidgetConfig) => void }) {
  const { type, config } = widget
  const [title, setTitle] = useState(config.title ?? '')
  const [metrics, setMetrics] = useState<string[]>(config.metrics ?? [])
  const [level, setLevel] = useState<InsightLevel>(config.query?.level ?? 'campaign')
  const [breakdown, setBreakdown] = useState<Breakdown>(config.query?.breakdown ?? 'publisher_platform')
  const [body, setBody] = useState(config.body ?? '')

  const multi = type === 'line' || type === 'table'
  const needsMetrics = type !== 'text'

  function toggle(key: string) {
    if (multi) setMetrics((m) => (m.includes(key) ? m.filter((k) => k !== key) : [...m, key]))
    else setMetrics([key])
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-lg capitalize">Edit {type} widget</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional" />
        </div>

        {type === 'text' && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Text</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        )}

        {type === 'table' && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Rows are</label>
            <FormSelect name="level" options={LEVELS} defaultValue={level} onValueChange={(v) => setLevel(v as InsightLevel)} />
          </div>
        )}

        {(type === 'bar' || type === 'donut') && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Break down by</label>
            <FormSelect name="breakdown" options={BREAKDOWNS} defaultValue={breakdown} onValueChange={(v) => setBreakdown(v as Breakdown)} />
          </div>
        )}

        {needsMetrics && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{multi ? 'Metrics' : 'Metric'}</label>
            <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-border p-2">
              {Object.entries(METRIC_CATALOG).map(([key, def]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type={multi ? 'checkbox' : 'radio'}
                    name="metric"
                    checked={metrics.includes(key)}
                    onChange={() => toggle(key)}
                    className="accent-primary"
                  />
                  {def.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            disabled={needsMetrics && metrics.length === 0}
            onClick={() => onSave(buildConfig(type, { title, metrics, level, breakdown, body }))}
          >
            Apply
          </Button>
        </div>
      </div>
    </>
  )
}
