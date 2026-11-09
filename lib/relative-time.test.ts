import { describe, expect, it } from 'vitest'
import { relativeTime } from './relative-time'

const NOW = Date.parse('2026-11-09T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('relativeTime', () => {
  it('says just now for under a minute', () => {
    expect(relativeTime(ago(20_000), NOW)).toBe('just now')
  })
  it('uses minutes, hours and days', () => {
    expect(relativeTime(ago(5 * MIN), NOW)).toBe('5 minutes ago')
    expect(relativeTime(ago(1 * MIN), NOW)).toBe('1 minute ago')
    expect(relativeTime(ago(3 * HOUR), NOW)).toBe('3 hours ago')
    expect(relativeTime(ago(2 * DAY), NOW)).toBe('2 days ago')
  })
  it('falls back to a date after a week', () => {
    expect(relativeTime(ago(10 * DAY), NOW)).toBe('30 Oct 2026')
  })
  it('treats a future timestamp (clock skew) as just now', () => {
    expect(relativeTime(new Date(NOW + 5 * MIN).toISOString(), NOW)).toBe('just now')
  })
})
