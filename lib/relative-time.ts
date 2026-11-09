const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** Wall-clock now; kept here so pages can read the time without calling Date.now() during render. */
export function currentTime(): number {
  return Date.now()
}

/** "5 minutes ago" style text; older than a week falls back to "30 Oct 2026". */
export function relativeTime(iso: string, now: number): string {
  const diff = now - Date.parse(iso)
  if (diff < MIN) return 'just now'

  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`
  if (diff < HOUR) return plural(Math.floor(diff / MIN), 'minute')
  if (diff < DAY) return plural(Math.floor(diff / HOUR), 'hour')
  if (diff < 7 * DAY) return plural(Math.floor(diff / DAY), 'day')

  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
