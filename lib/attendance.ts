/** The first IP in an X-Forwarded-For header value, or null if absent/empty. */
export function parseClientIp(forwardedFor: string | null): string | null {
  if (!forwardedFor) return null
  const first = forwardedFor.split(',')[0]?.trim()
  return first && first.length > 0 ? first : null
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

/** Today's date as YYYY-MM-DD in the server's local time zone. */
export function todayDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
