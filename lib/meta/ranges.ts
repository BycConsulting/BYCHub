export type DateRange = { from: string; to: string }

export type RangePreset = 'last_7' | 'last_30' | 'this_week' | 'last_week' | 'this_month' | 'last_month'

const DAY = 86_400_000

function toMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fmt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function presetRange(preset: RangePreset, today: string): DateRange {
  const t = toMs(today)
  const monday = t - ((new Date(t).getUTCDay() + 6) % 7) * DAY
  const monthStart = toMs(today.slice(0, 7) + '-01')
  const prevMonthStart = Date.UTC(new Date(monthStart).getUTCFullYear(), new Date(monthStart).getUTCMonth() - 1, 1)

  switch (preset) {
    case 'last_7':
      return { from: fmt(t - 7 * DAY), to: fmt(t - DAY) }
    case 'last_30':
      return { from: fmt(t - 30 * DAY), to: fmt(t - DAY) }
    case 'this_week':
      return { from: fmt(monday), to: today }
    case 'last_week':
      return { from: fmt(monday - 7 * DAY), to: fmt(monday - DAY) }
    case 'this_month':
      return { from: fmt(monthStart), to: today }
    case 'last_month':
      return { from: fmt(prevMonthStart), to: fmt(monthStart - DAY) }
  }
}

/** Same-length range ending the day before `range.from`. */
export function previousPeriod(range: DateRange): DateRange {
  const from = toMs(range.from)
  const days = (toMs(range.to) - from) / DAY + 1
  const prevTo = from - DAY
  return { from: fmt(prevTo - (days - 1) * DAY), to: fmt(prevTo) }
}

/** Percentage change, or null when there is no previous value to compare against. */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / previous) * 100
}
