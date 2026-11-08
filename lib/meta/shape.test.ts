import { describe, expect, it } from 'vitest'
import { breakdownPairs, formatMetric, kpiChange, kpiValue, seriesByDay } from './shape'

describe('kpiValue', () => {
  it('is 0 when Meta returned no rows', () => {
    expect(kpiValue([], 'spend')).toBe(0)
  })
  it('reads the first row', () => {
    expect(kpiValue([{ spend: '12.5' }], 'spend')).toBe(12.5)
  })
})

describe('seriesByDay', () => {
  it('sorts by date and derives each metric', () => {
    const rows = [
      { date_start: '2026-11-02', spend: '5' },
      { date_start: '2026-11-01', spend: '3' },
    ]
    expect(seriesByDay(rows, ['spend'])).toEqual([
      { date: '2026-11-01', spend: 3 },
      { date: '2026-11-02', spend: 5 },
    ])
  })
  it('returns an empty series for no rows', () => {
    expect(seriesByDay([], ['spend'])).toEqual([])
  })
})

describe('breakdownPairs', () => {
  it('labels by the breakdown field and sorts largest first', () => {
    const rows = [
      { publisher_platform: 'instagram', spend: '4' },
      { publisher_platform: 'facebook', spend: '9' },
    ]
    expect(breakdownPairs(rows, 'spend', 'publisher_platform')).toEqual([
      { label: 'facebook', value: 9 },
      { label: 'instagram', value: 4 },
    ])
  })
})

describe('formatMetric', () => {
  it('formats currency, percent, ratio and counts', () => {
    expect(formatMetric('spend', 12400)).toBe('₹12,400')
    expect(formatMetric('ctr', 1.234)).toBe('1.2%')
    expect(formatMetric('roas', 3.456)).toBe('3.46x')
    expect(formatMetric('impressions', 950)).toBe('950')
  })
  it('uses rupees with Indian digit grouping', () => {
    expect(formatMetric('spend', 124000)).toBe('₹1,24,000')
    expect(formatMetric('cpc', 12.5)).toBe('₹12.5')
    expect(formatMetric('reach', 482000)).toBe('4,82,000')
  })
  it('shows a dash for 0 cost-per-result', () => {
    expect(formatMetric('cost_per_result', 0)).toBe('—')
  })
})

describe('kpiChange', () => {
  it('is null when a cost ratio is undefined (no results) so it never shows a false improvement', () => {
    expect(kpiChange('cost_per_result', 0, 50)).toBeNull()
    expect(kpiChange('cost_per_result', 30, 0)).toBeNull()
    expect(kpiChange('roas', 0, 2)).toBeNull()
  })
  it('still reports real zeros for additive metrics', () => {
    expect(kpiChange('spend', 0, 50)).toBe(-100)
    expect(kpiChange('spend', 110, 100)).toBe(10)
  })
  it('is null when the previous value is 0', () => {
    expect(kpiChange('spend', 10, 0)).toBeNull()
  })
})
