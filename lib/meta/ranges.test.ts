import { describe, expect, it } from 'vitest'
import { changePercent, presetRange, previousPeriod } from './ranges'

describe('previousPeriod', () => {
  it('returns the same-length range ending the day before from', () => {
    expect(previousPeriod({ from: '2026-11-01', to: '2026-11-30' })).toEqual({ from: '2026-10-02', to: '2026-10-31' })
  })
})

describe('presetRange', () => {
  it('last_7 is the 7 days before today', () => {
    expect(presetRange('last_7', '2026-11-08')).toEqual({ from: '2026-11-01', to: '2026-11-07' })
  })
  it('last_month is the full previous calendar month', () => {
    expect(presetRange('last_month', '2026-11-08')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })
  it('this_week runs Monday to today', () => {
    expect(presetRange('this_week', '2026-11-08')).toEqual({ from: '2026-11-02', to: '2026-11-08' })
  })
  it('last_week is the previous Monday to Sunday', () => {
    expect(presetRange('last_week', '2026-11-08')).toEqual({ from: '2026-10-26', to: '2026-11-01' })
  })
})

describe('changePercent', () => {
  it('is null when previous is 0', () => {
    expect(changePercent(10, 0)).toBeNull()
  })
  it('is the percentage change otherwise', () => {
    expect(changePercent(110, 100)).toBe(10)
    expect(changePercent(90, 100)).toBe(-10)
  })
})
