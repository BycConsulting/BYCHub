import { pageRows, type Orientation, type Page, type Widget, type WidgetConfig, type WidgetType } from './layout'
import type { Breakdown, InsightLevel } from './query'

const DEFAULT_SIZE: Record<WidgetType, { w: number; h: number }> = {
  kpi: { w: 3, h: 4 },
  line: { w: 8, h: 10 },
  bar: { w: 6, h: 10 },
  donut: { w: 4, h: 10 },
  table: { w: 12, h: 10 },
  text: { w: 12, h: 3 },
}

export type ConfigInput = {
  title?: string
  metrics?: string[]
  level?: InsightLevel
  breakdown?: Breakdown
  body?: string
}

/** Builds the stored widget config from what the config dialog collected. */
export function buildConfig(type: WidgetType, input: ConfigInput): WidgetConfig {
  const title = input.title?.trim() || undefined
  const metrics = input.metrics ?? []

  switch (type) {
    case 'text':
      return { ...(title ? { title } : {}), body: input.body ?? '' }
    case 'kpi':
      return { ...(title ? { title } : {}), metrics: metrics.slice(0, 1), query: { level: 'account', metrics: metrics.slice(0, 1) } }
    case 'line':
      return { ...(title ? { title } : {}), metrics, query: { level: 'account', metrics, timeIncrement: 'day' } }
    case 'bar':
    case 'donut':
      return {
        ...(title ? { title } : {}),
        metrics: metrics.slice(0, 1),
        query: { level: 'account', metrics: metrics.slice(0, 1), ...(input.breakdown ? { breakdown: input.breakdown } : {}) },
      }
    case 'table':
      return { ...(title ? { title } : {}), metrics, query: { level: input.level ?? 'campaign', metrics } }
  }
}

export function defaultWidget(type: WidgetType, id: string): Widget {
  const defaults: Record<WidgetType, ConfigInput> = {
    kpi: { metrics: ['spend'] },
    line: { metrics: ['spend', 'results'] },
    bar: { metrics: ['results'], breakdown: 'age' },
    donut: { metrics: ['spend'], breakdown: 'publisher_platform' },
    table: { metrics: ['spend', 'results'], level: 'campaign' },
    text: { body: 'Notes' },
  }
  return { id, type, x: 0, y: 0, ...DEFAULT_SIZE[type], config: buildConfig(type, defaults[type]) }
}

/** Adds the widget below everything already on the page, or returns null if it would run off the page. */
export function placeNewWidget(page: Page, orientation: Orientation, widget: Widget): Page | null {
  const y = page.reduce((bottom, w) => Math.max(bottom, w.y + w.h), 0)
  if (y + widget.h > pageRows(orientation)) return null
  return [...page, { ...widget, x: 0, y }]
}

export function applyLayout(page: Page, items: { i: string; x: number; y: number; w: number; h: number }[]): Page {
  const byId = new Map(items.map((item) => [item.i, item]))
  let changed = false
  const next = page.map((widget) => {
    const item = byId.get(widget.id)
    if (!item || (item.x === widget.x && item.y === widget.y && item.w === widget.w && item.h === widget.h)) return widget
    changed = true
    return { ...widget, x: item.x, y: item.y, w: item.w, h: item.h }
  })
  return changed ? next : page
}

export function newWidgetId(pages: Page[]): string {
  const used = new Set(pages.flat().map((w) => w.id))
  let n = used.size + 1
  while (used.has(`w${n}`)) n++
  return `w${n}`
}
