import { describe, expect, it } from 'vitest'
import { METRIC_CATALOG } from './metrics'
import { pageRows, pagesSchema, pagesSchemaFor, STANDARD_PAGES } from './layout'

const base = { id: 'w', type: 'text' as const, x: 0, y: 0, w: 4, h: 2, config: { body: 'hi' } }

describe('standard template', () => {
  it('passes the layout schema', () => {
    expect(() => pagesSchema.parse(STANDARD_PAGES)).not.toThrow()
  })
  it('uses unique widget ids across pages', () => {
    const ids = STANDARD_PAGES.flat().map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('only references metrics that exist in the catalog', () => {
    const used = STANDARD_PAGES.flat().flatMap((w) => [...(w.config.metrics ?? []), ...(w.config.query?.metrics ?? [])])
    for (const key of used) expect(METRIC_CATALOG[key], key).toBeDefined()
  })
})

describe('pagesSchema', () => {
  it('rejects a widget wider than the 12-column grid', () => {
    expect(pagesSchema.safeParse([[{ ...base, x: 10, w: 4 }]]).success).toBe(false)
  })
  it('rejects a widget below the last row of the page', () => {
    expect(pagesSchema.safeParse([[{ ...base, y: pageRows('landscape') - 1, h: 3 }]]).success).toBe(false)
  })
  it('rejects zero-size widgets', () => {
    expect(pagesSchema.safeParse([[{ ...base, w: 0 }]]).success).toBe(false)
  })
  it('allows portrait pages to be taller than landscape ones', () => {
    const tall = [[{ ...base, y: 40, h: 4 }]]
    expect(pagesSchema.safeParse(tall).success).toBe(false)
    expect(pagesSchemaFor('portrait').safeParse(tall).success).toBe(true)
  })
})
