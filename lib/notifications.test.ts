import { describe, expect, it, vi } from 'vitest'
import { buildNotifications, notify, safeLink, type NotificationInput } from './notifications'

const base: NotificationInput = {
  type: 'task_assigned',
  title: 'You were assigned a task',
  link: '/hrm/tasks/1',
  actorId: 'actor',
  recipientIds: ['a', 'b'],
}

describe('buildNotifications', () => {
  it('creates one row per recipient with defaults', () => {
    const rows = buildNotifications(base)
    expect(rows.map((r) => r.user_id)).toEqual(['a', 'b'])
    expect(rows[0]).toMatchObject({ type: 'task_assigned', body: '', link: '/hrm/tasks/1', actor_id: 'actor' })
  })
  it('never notifies the actor about their own action', () => {
    expect(buildNotifications({ ...base, recipientIds: ['actor', 'a'] }).map((r) => r.user_id)).toEqual(['a'])
  })
  it('sends one notification to a recipient listed twice', () => {
    expect(buildNotifications({ ...base, recipientIds: ['a', 'a'] })).toHaveLength(1)
  })
  it('drops null and undefined recipients', () => {
    expect(buildNotifications({ ...base, recipientIds: [null, undefined, 'a'] }).map((r) => r.user_id)).toEqual(['a'])
  })
  it('returns no rows when nobody is left', () => {
    expect(buildNotifications({ ...base, recipientIds: ['actor', null] })).toEqual([])
  })
})

function fakeClient(result: () => Promise<{ error: { message: string } | null }>) {
  const insert = vi.fn((rows: unknown[]) => {
    void rows
    return result()
  })
  return { insert, client: { from: () => ({ insert }) } }
}

describe('notify', () => {
  it('inserts the built rows once', async () => {
    const { insert, client } = fakeClient(async () => ({ error: null }))
    await notify(base, client)
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0][0]).toHaveLength(2)
  })
  it('accepts several inputs and inserts them together', async () => {
    const { insert, client } = fakeClient(async () => ({ error: null }))
    await notify([base, { ...base, type: 'task_support', recipientIds: ['c'] }], client)
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0][0]).toHaveLength(3)
  })
  it('does not insert when there are no recipients', async () => {
    const { insert, client } = fakeClient(async () => ({ error: null }))
    await notify({ ...base, recipientIds: ['actor'] }, client)
    expect(insert).not.toHaveBeenCalled()
  })
  it('resolves when the insert returns an error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient(async () => ({ error: { message: 'boom' } }))
    await expect(notify(base, client)).resolves.toBeUndefined()
    spy.mockRestore()
  })
  it('resolves when the insert throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient(async () => {
      throw new Error('network')
    })
    await expect(notify(base, client)).resolves.toBeUndefined()
    spy.mockRestore()
  })
})

describe('safeLink', () => {
  it('keeps relative paths', () => {
    expect(safeLink('/hrm/tasks/1')).toBe('/hrm/tasks/1')
  })
  it('falls back for absolute, protocol-relative and empty links', () => {
    expect(safeLink('https://evil.com')).toBe('/notifications')
    expect(safeLink('//evil.com')).toBe('/notifications')
    expect(safeLink('')).toBe('/notifications')
  })
})
