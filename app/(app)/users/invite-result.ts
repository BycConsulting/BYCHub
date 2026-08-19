// Shared between the invite Server Action and the /users page. Lives outside
// actions.ts because a 'use server' module may only export async functions.
export const INVITE_RESULT_COOKIE = 'invite_result'

export interface InviteResult {
  email: string
  tempPassword: string
}

export function parseInviteResult(raw: string | undefined): InviteResult | null {
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as InviteResult).email === 'string' &&
      typeof (parsed as InviteResult).tempPassword === 'string'
    ) {
      const { email, tempPassword } = parsed as InviteResult
      return { email, tempPassword }
    }
  } catch {
    // Malformed cookie (hand-edited or truncated) — show nothing.
  }

  return null
}
