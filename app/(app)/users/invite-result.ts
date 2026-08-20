// Shared between the invite/reset-password Server Actions and the /users page.
// Lives outside actions.ts because a 'use server' module may only export
// async functions. Reused for both invite and reset-password results since
// both hand back the same shape (an email + a one-time temp password) — the
// `action` field is only there to pick the right wording on display.
export const INVITE_RESULT_COOKIE = 'invite_result'

export interface InviteResult {
  email: string
  tempPassword: string
  action: 'invited' | 'reset'
}

export function parseInviteResult(raw: string | undefined): InviteResult | null {
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as InviteResult).email === 'string' &&
      typeof (parsed as InviteResult).tempPassword === 'string' &&
      ((parsed as InviteResult).action === 'invited' || (parsed as InviteResult).action === 'reset')
    ) {
      const { email, tempPassword, action } = parsed as InviteResult
      return { email, tempPassword, action }
    }
  } catch {
    // Malformed cookie (hand-edited or truncated) — show nothing.
  }

  return null
}
