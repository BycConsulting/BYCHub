'use client'

import { useState } from 'react'
import type { CatalogMetric } from '@/lib/metric-catalog'

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

      <select
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        required
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
      >
        <option value="" disabled>
          Select a metric…
        </option>
        {channelsInOrder.map((channelName) => (
          <optgroup key={channelName} label={channelName}>
            {catalog
              .filter((option) => option.channel === channelName)
              .map((option) => (
                <option key={`${option.channel}|${option.metricKey}`} value={`${option.channel}|${option.metricKey}`}>
                  {option.label}
                </option>
              ))}
          </optgroup>
        ))}
        <option value="__custom__">Custom…</option>
      </select>

      {isCustom && (
        <div className="grid grid-cols-3 gap-2">
          <input
            value={customChannel}
            onChange={(event) => setCustomChannel(event.target.value)}
            placeholder="Channel (e.g. TikTok Ads)"
            required
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          />
          <input
            value={customLabel}
            onChange={(event) => setCustomLabel(event.target.value)}
            placeholder="Metric name"
            required
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          />
          <input
            value={customUnit}
            onChange={(event) => setCustomUnit(event.target.value)}
            placeholder="Unit (optional)"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <input
          name="value"
          type="number"
          step="any"
          placeholder="Value"
          required
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
        />
        <input
          name="notes"
          placeholder="Notes (optional)"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
        />
      </div>

      <button
        type="submit"
        className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 active:scale-[0.98] transition-transform"
      >
        Add metric
      </button>
    </form>
  )
}
