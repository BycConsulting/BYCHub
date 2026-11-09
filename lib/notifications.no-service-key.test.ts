import { describe, expect, it, vi } from 'vitest'

// Simulates an environment without SUPABASE_SERVICE_ROLE_KEY: creating the admin client throws.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabaseClient: () => {
    throw new Error('Missing environment variable SUPABASE_SERVICE_ROLE_KEY')
  },
}))

import { notify } from './notifications'
import { leaveApprovers } from './leave-approvers'

describe('without the service-role key', () => {
  it('notify still resolves instead of failing the action that saved', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      notify({ type: 'task_assigned', title: 't', link: '/x', actorId: 'a', recipientIds: ['b'] })
    ).resolves.toBeUndefined()
    spy.mockRestore()
  })
  it('leaveApprovers resolves to nobody instead of throwing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(leaveApprovers('emp')).resolves.toEqual({ managerId: null, hrIds: [] })
    spy.mockRestore()
  })
})
