import { describe, expect, it } from 'vitest'
import { requireEnv } from './env'

describe('requireEnv', () => {
  it('returns the value when it is set', () => {
    expect(requireEnv('NEXT_PUBLIC_SUPABASE_URL', { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' })).toBe('https://x.supabase.co')
  })
  it('names the missing variable and where to set it', () => {
    expect(() => requireEnv('SUPABASE_SERVICE_ROLE_KEY', {})).toThrow(/SUPABASE_SERVICE_ROLE_KEY.*\.env\.local.*Vercel/)
  })
  it('treats an empty or whitespace value as missing', () => {
    expect(() => requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', { NEXT_PUBLIC_SUPABASE_ANON_KEY: '  ' })).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  })
})
