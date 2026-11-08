import { METRIC_CATALOG } from '@/lib/meta/metrics'
import { changePercent } from '@/lib/meta/ranges'
import { formatMetric, kpiValue } from '@/lib/meta/shape'
import type { Widget } from '@/lib/meta/layout'
import type { WidgetData } from '@/lib/meta/report-data'
import { BarWidget, DonutWidget, LineWidget } from './chart-widgets'

const LOWER_IS_BETTER = new Set(['cost_per_result', 'cpc', 'cpm'])

const NAME_FIELD = { account: 'account_name', campaign: 'campaign_name', adset: 'adset_name', ad: 'ad_name' } as const

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">{children}</div>
}

function Body({ widget, data }: { widget: Widget; data: WidgetData | undefined }) {
  const { config } = widget

  if (widget.type === 'text') {
    return <p className="whitespace-pre-wrap text-sm text-foreground">{config.body}</p>
  }
  if (!data) return <Empty>No data yet — press Refresh</Empty>
  if (data.error) return <Empty>{data.error}</Empty>

  const metrics = config.metrics ?? config.query?.metrics ?? []
  const breakdown = config.query?.breakdown

  switch (widget.type) {
    case 'kpi': {
      const metric = metrics[0]
      const value = kpiValue(data.rows, metric)
      const change = data.previous ? changePercent(value, kpiValue(data.previous, metric)) : null
      const good = change === null ? null : LOWER_IS_BETTER.has(metric) ? change <= 0 : change >= 0
      return (
        <div className="flex h-full flex-col justify-center">
          <div className="text-2xl font-semibold tracking-tight text-foreground">{formatMetric(metric, value)}</div>
          {data.previous && (
            <div className={`text-xs font-medium ${change === null ? 'text-muted-foreground' : good ? 'text-success' : 'text-destructive'}`}>
              {change === null ? '—' : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}%`}
            </div>
          )}
        </div>
      )
    }
    case 'line':
      return <LineWidget rows={data.rows} metrics={metrics} />
    case 'bar':
      return breakdown ? <BarWidget rows={data.rows} metric={metrics[0]} breakdown={breakdown} /> : <Empty>Pick a breakdown</Empty>
    case 'donut':
      return breakdown ? <DonutWidget rows={data.rows} metric={metrics[0]} breakdown={breakdown} /> : <Empty>Pick a breakdown</Empty>
    case 'table': {
      if (data.rows.length === 0) return <Empty>No results in this period</Empty>
      const nameField = NAME_FIELD[config.query?.level ?? 'account']
      return (
        <div className="h-full overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Name</th>
                {metrics.map((m) => (
                  <th key={m} className="py-1 pl-2 text-right font-medium">
                    {METRIC_CATALOG[m]?.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="max-w-[220px] truncate py-1 pr-2">{String(row[nameField] ?? 'Account')}</td>
                  {metrics.map((m) => (
                    <td key={m} className="py-1 pl-2 text-right tabular-nums">
                      {formatMetric(m, METRIC_CATALOG[m].derive(row))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
  }
}

export function ReportWidget({ widget, data }: { widget: Widget; data: WidgetData | undefined }) {
  const metricTitle = widget.type === 'kpi' ? METRIC_CATALOG[widget.config.metrics?.[0] ?? '']?.label : undefined
  const title = widget.config.title ?? metricTitle

  return (
    <div className="h-full p-1">
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card p-2.5">
        {title && <div className="mb-1 truncate text-xs font-medium text-muted-foreground">{title}</div>}
        <div className="min-h-0 flex-1">
          <Body widget={widget} data={data} />
        </div>
      </div>
    </div>
  )
}
