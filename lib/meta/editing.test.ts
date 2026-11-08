import { describe, expect, it } from 'vitest'
import { applyLayout, buildConfig, defaultWidget, newWidgetId, placeNewWidget } from './editing'
import { pageRows, pagesSchemaFor, type Page } from './layout'

describe('placeNewWidget', () => {
  it('puts the widget below the lowest existing one', () => {
    const page: Page = [{ ...defaultWidget('kpi', 'a'), y: 0, h: 4 }]
    const placed = placeNewWidget(page, 'landscape', defaultWidget('text', 'b'))
    expect(placed?.find((w) => w.id === 'b')?.y).toBe(4)
  })
  it('starts at the top of an empty page', () => {
    expect(placeNewWidget([], 'landscape', defaultWidget('kpi', 'a'))?.[0].y).toBe(0)
  })
  it('returns null when it would not fit on the page', () => {
    const page: Page = [{ ...defaultWidget('table', 'a'), y: 0, h: pageRows('landscape') - 1 }]
    expect(placeNewWidget(page, 'landscape', defaultWidget('line', 'b'))).toBeNull()
  })
  it('produces layouts that pass the page schema', () => {
    const placed = placeNewWidget([], 'landscape', defaultWidget('donut', 'a'))!
    expect(pagesSchemaFor('landscape').safeParse([placed]).success).toBe(true)
  })
})

describe('buildConfig', () => {
  it('kpi keeps only the first metric at account level', () => {
    const c = buildConfig('kpi', { metrics: ['spend', 'reach'], level: 'campaign', breakdown: 'age' })
    expect(c.metrics).toEqual(['spend'])
    expect(c.query).toEqual({ level: 'account', metrics: ['spend'] })
  })
  it('line is a daily series', () => {
    expect(buildConfig('line', { metrics: ['spend', 'results'] }).query).toEqual({
      level: 'account',
      metrics: ['spend', 'results'],
      timeIncrement: 'day',
    })
  })
  it('bar and donut carry the breakdown', () => {
    expect(buildConfig('bar', { metrics: ['results'], breakdown: 'age' }).query?.breakdown).toBe('age')
    expect(buildConfig('donut', { metrics: ['spend'], breakdown: 'gender' }).query?.breakdown).toBe('gender')
  })
  it('table uses the chosen level and all metrics', () => {
    expect(buildConfig('table', { metrics: ['spend', 'ctr'], level: 'adset' }).query).toEqual({
      level: 'adset',
      metrics: ['spend', 'ctr'],
    })
  })
  it('text has a body and no query', () => {
    const c = buildConfig('text', { body: 'hello', title: 'Notes' })
    expect(c).toEqual({ title: 'Notes', body: 'hello' })
  })
})

describe('applyLayout', () => {
  it('updates positions by id and leaves other widgets alone', () => {
    const page: Page = [defaultWidget('kpi', 'a'), defaultWidget('text', 'b')]
    const next = applyLayout(page, [{ i: 'a', x: 3, y: 5, w: 2, h: 2 }])
    expect(next[0]).toMatchObject({ id: 'a', x: 3, y: 5, w: 2, h: 2 })
    expect(next[1]).toEqual(page[1])
  })
})

describe('applyLayout stability', () => {
  it('returns the same page object when no position changed, so the editor does not re-render in a loop', () => {
    const page: Page = [defaultWidget('kpi', 'a')]
    const same = [{ i: 'a', x: page[0].x, y: page[0].y, w: page[0].w, h: page[0].h }]
    expect(applyLayout(page, same)).toBe(page)
  })
})

describe('newWidgetId', () => {
  it('never reuses an id that is in use', () => {
    const pages: Page[] = [[defaultWidget('kpi', 'w1'), defaultWidget('kpi', 'w2')]]
    const ids = pages.flat().map((w) => w.id)
    expect(ids).not.toContain(newWidgetId(pages))
  })
})
