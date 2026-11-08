import { describe, expect, it } from 'vitest'
import { mapMetaError } from './client'

describe('mapMetaError', () => {
  it('maps 190 to token', () => {
    expect(mapMetaError(190, 'expired').kind).toBe('token')
  })
  it.each([4, 17, 32, 613])('maps %i to rate_limit', (code) => {
    expect(mapMetaError(code, 'slow down').kind).toBe('rate_limit')
  })
  it.each([10, 200])('maps %i to permission', (code) => {
    expect(mapMetaError(code, 'no access').kind).toBe('permission')
  })
  it('maps anything else to other and keeps the message', () => {
    const err = mapMetaError(1, 'boom')
    expect(err.kind).toBe('other')
    expect(err.message).toContain('boom')
  })
})
