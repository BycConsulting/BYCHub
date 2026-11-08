import { z } from 'zod'
import { METRIC_CATALOG } from './metrics'
import type { WidgetQuery } from './query'

export const GRID_COLUMNS = 12
export const ROW_HEIGHT_PX = 24

export const PAGE_SIZE_PX = {
  landscape: { width: 1123, height: 794 },
  portrait: { width: 794, height: 1123 },
} as const

export type Orientation = keyof typeof PAGE_SIZE_PX

export const widgetTypes = ['kpi', 'line', 'bar', 'donut', 'table', 'text'] as const
export type WidgetType = (typeof widgetTypes)[number]

export type WidgetConfig = {
  title?: string
  /** What to fetch from Meta; absent for text widgets. */
  query?: WidgetQuery
  /** Metrics shown (KPI tiles show the first; tables show all as columns). */
  metrics?: string[]
  body?: string
}

export type Widget = { id: string; type: WidgetType; x: number; y: number; w: number; h: number; config: WidgetConfig }
export type Page = Widget[]

export function pageRows(orientation: Orientation): number {
  return Math.floor(PAGE_SIZE_PX[orientation].height / ROW_HEIGHT_PX)
}

const metricKey = z.string().refine((key) => key in METRIC_CATALOG, 'Unknown metric')

const querySchema = z.object({
  level: z.enum(['account', 'campaign', 'adset', 'ad']),
  metrics: z.array(metricKey).min(1),
  breakdown: z.enum(['publisher_platform', 'platform_position', 'age', 'gender', 'country']).optional(),
  timeIncrement: z.literal('day').optional(),
})

const widgetSchema = z.object({
  id: z.string().min(1),
  type: z.enum(widgetTypes),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
  config: z.object({
    title: z.string().max(120).optional(),
    query: querySchema.optional(),
    metrics: z.array(metricKey).optional(),
    body: z.string().max(4000).optional(),
  }),
})

export function pagesSchemaFor(orientation: Orientation) {
  const rows = pageRows(orientation)
  return z
    .array(
      z.array(
        widgetSchema.refine((w) => w.x + w.w <= GRID_COLUMNS, 'Widget is wider than the page').refine((w) => w.y + w.h <= rows, 'Widget is below the page')
      )
    )
    .superRefine((pages, ctx) => {
      const ids = pages.flat().map((w) => w.id)
      if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Widget ids must be unique' })
    })
}

export const pagesSchema = pagesSchemaFor('landscape')

const kpi = (id: string, x: number, w: number, metric: string): Widget => ({
  id,
  type: 'kpi',
  x,
  y: 2,
  w,
  h: 4,
  config: { metrics: [metric], query: { level: 'account', metrics: [metric] } },
})

/** The template every client's first report is copied from (landscape A4). */
export const STANDARD_PAGES: Page[] = [
  [
    { id: 'p1-title', type: 'text', x: 0, y: 0, w: 12, h: 2, config: { body: 'Meta Ads performance' } },
    kpi('p1-spend', 0, 3, 'spend'),
    kpi('p1-reach', 3, 2, 'reach'),
    kpi('p1-clicks', 5, 2, 'clicks'),
    kpi('p1-leads', 7, 2, 'results'),
    kpi('p1-cpl', 9, 3, 'cost_per_result'),
    {
      id: 'p1-trend',
      type: 'line',
      x: 0,
      y: 6,
      w: 8,
      h: 10,
      config: {
        title: 'Spend and leads by day',
        metrics: ['spend', 'results'],
        query: { level: 'account', metrics: ['spend', 'results'], timeIncrement: 'day' },
      },
    },
    {
      id: 'p1-platform',
      type: 'donut',
      x: 8,
      y: 6,
      w: 4,
      h: 10,
      config: {
        title: 'Spend by platform',
        metrics: ['spend'],
        query: { level: 'account', metrics: ['spend'], breakdown: 'publisher_platform' },
      },
    },
    {
      id: 'p1-campaigns',
      type: 'table',
      x: 0,
      y: 16,
      w: 12,
      h: 15,
      config: {
        title: 'Campaigns',
        metrics: ['spend', 'reach', 'clicks', 'ctr', 'results', 'cost_per_result', 'roas'],
        query: { level: 'campaign', metrics: ['spend', 'reach', 'clicks', 'ctr', 'results', 'cost_per_result', 'roas'] },
      },
    },
  ],
  [
    {
      id: 'p2-adsets',
      type: 'table',
      x: 0,
      y: 0,
      w: 12,
      h: 13,
      config: {
        title: 'Ad sets',
        metrics: ['spend', 'reach', 'clicks', 'ctr', 'results', 'cost_per_result'],
        query: { level: 'adset', metrics: ['spend', 'reach', 'clicks', 'ctr', 'results', 'cost_per_result'] },
      },
    },
    {
      id: 'p2-placement',
      type: 'bar',
      x: 0,
      y: 13,
      w: 6,
      h: 10,
      config: {
        title: 'Leads by placement',
        metrics: ['results'],
        query: { level: 'account', metrics: ['results'], breakdown: 'platform_position' },
      },
    },
    {
      id: 'p2-age',
      type: 'bar',
      x: 6,
      y: 13,
      w: 6,
      h: 10,
      config: {
        title: 'Leads by age',
        metrics: ['results'],
        query: { level: 'account', metrics: ['results'], breakdown: 'age' },
      },
    },
    { id: 'p2-notes', type: 'text', x: 0, y: 23, w: 12, h: 8, config: { title: 'Notes', body: 'Add notes and recommendations here.' } },
  ],
]
