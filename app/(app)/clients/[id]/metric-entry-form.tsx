'use client'

import { useState } from 'react'
import type { CatalogMetric } from '@/lib/metric-catalog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'

export function MetricEntryForm({
  action,
  clientId,
  period,
  catalog,
}: {
  action: (formData: FormData) => void
  clientId: string
  period: string
  catalog: CatalogMetric[]
}) {
  const [selected, setSelected] = useState('')
  const [customChannel, setCustomChannel] = useState('')
  const [customLabel, setCustomLabel] = useState('')
  const [customUnit, setCustomUnit] = useState('')

  const isCustom = selected === '__custom__'
  const picked = catalog.find((option) => `${option.channel}|${option.metricKey}` === selected)

  const channel = isCustom ? customChannel : (picked?.channel ?? '')
  const metricKey = isCustom ? '' : (picked?.metricKey ?? '')
  const metricLabel = isCustom ? customLabel : (picked?.label ?? '')
  const unit = isCustom ? customUnit : (picked?.unit ?? '')

  const channelsInOrder = Array.from(new Set(catalog.map((option) => option.channel)))

  return (
    <form action={action} className="mt-3 space-y-2 rounded-lg border border-slate-200 p-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="metricKey" value={metricKey} />
      <input type="hidden" name="metricLabel" value={metricLabel} />
      <input type="hidden" name="unit" value={unit} />

      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a metric…" />
        </SelectTrigger>
        <SelectContent>
          {channelsInOrder.map((channelName) => (
            <SelectGroup key={channelName}>
              <SelectLabel>{channelName}</SelectLabel>
              {catalog
                .filter((option) => option.channel === channelName)
                .map((option) => (
                  <SelectItem key={`${option.channel}|${option.metricKey}`} value={`${option.channel}|${option.metricKey}`}>
                    {option.label}
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
          <SelectItem value="__custom__">Custom…</SelectItem>
        </SelectContent>
      </Select>

      {isCustom && (
        <div className="grid grid-cols-3 gap-2">
          <Input
            value={customChannel}
            onChange={(event) => setCustomChannel(event.target.value)}
            placeholder="Channel (e.g. TikTok Ads)"
            required
          />
          <Input
            value={customLabel}
            onChange={(event) => setCustomLabel(event.target.value)}
            placeholder="Metric name"
            required
          />
          <Input
            value={customUnit}
            onChange={(event) => setCustomUnit(event.target.value)}
            placeholder="Unit (optional)"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Input name="value" type="number" step="any" placeholder="Value" required />
        <Input name="notes" placeholder="Notes (optional)" />
      </div>

      <Button type="submit">Add metric</Button>
    </form>
  )
}
