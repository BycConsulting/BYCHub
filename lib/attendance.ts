/**
 * The LAST IP in an X-Forwarded-For header value, or null if absent/empty.
 * Proxies APPEND to X-Forwarded-For, so the last entry is the one added by
 * the proxy nearest this server — the earliest entries are client-supplied
 * and trivially spoofable, so they must not be trusted.
 */
export function parseClientIp(forwardedFor: string | null): string | null {
  if (!forwardedFor) return null
  const parts = forwardedFor.split(',').map((part) => part.trim()).filter((part) => part.length > 0)
  return parts.length > 0 ? parts[parts.length - 1] : null
}

/** Whether `ip` is a syntactically valid IPv4 address (not IPv6 or garbage). */
export function isIpv4Address(ip: string): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => {
    const n = Number(part)
    return Number.isInteger(n) && n >= 0 && n <= 255 && String(n) === part
  })
}

/**
 * Whether `ip` matches any entry in a comma-separated allowlist of exact
 * IPv4 addresses and/or IPv4 CIDR ranges (e.g. "203.0.113.5,198.51.100.0/24").
 * Blank entries are ignored; a blank/empty allowlist matches nothing.
 * IPv6 is not supported — out of scope per the design spec.
 */
export function isIpAllowed(ip: string, allowlist: string): boolean {
  const entries = allowlist
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  return entries.some((entry) => matchesAllowlistEntry(ip, entry))
}

function matchesAllowlistEntry(ip: string, entry: string): boolean {
  if (!entry.includes('/')) return ip === entry

  const [rangeIp, prefixStr] = entry.split('/')
  const prefix = Number(prefixStr)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false

  const ipInt = ipv4ToInt(ip)
  const rangeInt = ipv4ToInt(rangeIp)
  if (ipInt === null || rangeInt === null) return false

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
  return (ipInt & mask) === (rangeInt & mask)
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null

  let result = 0
  for (const part of parts) {
    const n = Number(part)
    if (!Number.isInteger(n) || n < 0 || n > 255) return null
    result = (result << 8) | n
  }
  return result >>> 0
}

/** Hours worked (2 decimal places), or null if not yet checked out. */
export function hoursWorked(checkedInAt: string, checkedOutAt: string | null): number | null {
  if (!checkedOutAt) return null
  const ms = new Date(checkedOutAt).getTime() - new Date(checkedInAt).getTime()
  return Math.round((ms / 3600000) * 100) / 100
}

// India Standard Time is a fixed UTC+5:30 offset with no daylight saving
// observed, so a constant offset is safe here — no timezone library needed.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

/** Today's date as YYYY-MM-DD in India Standard Time (the company's timezone). */
export function todayDate(): string {
  const ist = new Date(Date.now() + IST_OFFSET_MS)
  const year = ist.getUTCFullYear()
  const month = String(ist.getUTCMonth() + 1).padStart(2, '0')
  const day = String(ist.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Converts a stored UTC ISO timestamp to an IST "YYYY-MM-DDTHH:mm" wall-clock
 * string, for pre-filling a <input type="datetime-local"> or for display.
 */
export function utcIsoToIstWallClock(isoUtc: string): string {
  const ist = new Date(new Date(isoUtc).getTime() + IST_OFFSET_MS)
  return ist.toISOString().slice(0, 16)
}

/**
 * Converts an IST "YYYY-MM-DDTHH:mm" wall-clock string (as submitted by a
 * <input type="datetime-local">, interpreted as IST) back to a UTC ISO
 * timestamp for storage.
 */
export function istWallClockToUtcIso(wallClock: string): string {
  const asUtc = new Date(wallClock + ':00Z')
  return new Date(asUtc.getTime() - IST_OFFSET_MS).toISOString()
}

/** Formats a stored UTC ISO timestamp as a human-readable IST time, e.g. "9:30 AM". */
export function formatIstTime(isoUtc: string): string {
  const wallClock = utcIsoToIstWallClock(isoUtc)
  const [, timePart] = wallClock.split('T')
  const [hourStr, minuteStr] = timePart.split(':')
  const hour24 = Number(hourStr)
  const period = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${minuteStr} ${period}`
}
