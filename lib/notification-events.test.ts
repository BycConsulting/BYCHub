import { describe, expect, it } from 'vitest'
import { buildNotifications, type NotificationInput } from './notifications'
import {
  leaveDecisionNotice,
  leaveSubmittedNotices,
  taskAssignmentNotices,
  taskCommentNotices,
  taskStatusNotices,
} from './notification-events'

/** What would actually be stored: recipients after dedupe and actor removal. */
const rows = (inputs: NotificationInput[]) => inputs.flatMap(buildNotifications)

const task = { taskId: 't1', title: 'Launch page', actorId: 'actor' }

describe('taskAssignmentNotices', () => {
  const none = { previousOwnerId: null, ownerId: null, previousSupportIds: [] as string[], supportIds: [] as string[] }

  it('notifies a newly assigned owner', () => {
    const r = rows(taskAssignmentNotices({ ...task, ...none, ownerId: 'bob' }))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ type: 'task_assigned', user_id: 'bob', link: '/hrm/tasks/t1' })
  })
  it('notifies nobody when you assign the task to yourself', () => {
    expect(rows(taskAssignmentNotices({ ...task, ...none, ownerId: 'actor' }))).toEqual([])
  })
  it('notifies nobody when the owner did not change', () => {
    expect(rows(taskAssignmentNotices({ ...task, ...none, previousOwnerId: 'bob', ownerId: 'bob' }))).toEqual([])
  })
  it('notifies nobody for an unassigned task', () => {
    expect(rows(taskAssignmentNotices({ ...task, ...none }))).toEqual([])
  })
  it('notifies only newly added support people', () => {
    const r = rows(taskAssignmentNotices({ ...task, ...none, previousSupportIds: ['a'], supportIds: ['a', 'b'] }))
    expect(r.map((x) => [x.type, x.user_id])).toEqual([['task_support', 'b']])
  })
})

describe('taskStatusNotices', () => {
  const base = { ...task, previousStatus: 'in_progress' as string | null, ownerId: 'owner', creatorId: 'creator' }

  it('tells the owner and creator when a task is blocked', () => {
    const r = rows(taskStatusNotices({ ...base, status: 'blocked' }))
    expect(r.map((x) => [x.type, x.user_id])).toEqual([['task_blocked', 'owner'], ['task_blocked', 'creator']])
  })
  it('tells them when a task is completed', () => {
    expect(rows(taskStatusNotices({ ...base, status: 'done' })).every((x) => x.type === 'task_completed')).toBe(true)
  })
  it('sends one notification when owner and creator are the same person', () => {
    expect(rows(taskStatusNotices({ ...base, creatorId: 'owner', status: 'done' }))).toHaveLength(1)
  })
  it('sends nothing when the status did not change', () => {
    expect(rows(taskStatusNotices({ ...base, previousStatus: 'blocked', status: 'blocked' }))).toEqual([])
  })
  it('sends nothing for other statuses', () => {
    expect(rows(taskStatusNotices({ ...base, status: 'in_progress', previousStatus: 'started' }))).toEqual([])
  })
  it('handles a task with no owner and no creator', () => {
    expect(rows(taskStatusNotices({ ...base, ownerId: null, creatorId: null, status: 'done' }))).toEqual([])
  })
})

describe('taskCommentNotices', () => {
  it('notifies owner, creator and support but not the commenter', () => {
    const r = rows(taskCommentNotices({ ...task, ownerId: 'owner', creatorId: 'actor', supportIds: ['s1', 'owner'] }))
    expect(r.map((x) => x.user_id).sort()).toEqual(['owner', 's1'])
  })
  it('notifies nobody on your own task with no one else involved', () => {
    expect(rows(taskCommentNotices({ ...task, ownerId: 'actor', creatorId: null, supportIds: [] }))).toEqual([])
  })
})

describe('leaveSubmittedNotices', () => {
  const base = { requestId: 'r1', employeeId: 'emp', employeeName: 'Asha' }

  it('goes only to the manager when one is set', () => {
    const r = rows(leaveSubmittedNotices({ ...base, managerId: 'mgr', hrIds: ['hr1'] }))
    expect(r.map((x) => x.user_id)).toEqual(['mgr'])
    expect(r[0]).toMatchObject({ type: 'leave_pending', link: '/hrm/leave' })
  })
  it('goes to HR when there is no manager', () => {
    const r = rows(leaveSubmittedNotices({ ...base, managerId: null, hrIds: ['hr1', 'hr2'] }))
    expect(r.map((x) => x.user_id)).toEqual(['hr1', 'hr2'])
    expect(r[0].link).toBe('/hrm/leave/requests')
  })
  it('sends nothing with no manager and no HR users', () => {
    expect(rows(leaveSubmittedNotices({ ...base, managerId: null, hrIds: [] }))).toEqual([])
  })
  it('names the employee in the title', () => {
    expect(leaveSubmittedNotices({ ...base, managerId: 'mgr', hrIds: [] })[0].title).toContain('Asha')
  })
})

describe('leaveDecisionNotice', () => {
  it('maps the decision to the notification type', () => {
    expect(leaveDecisionNotice({ employeeId: 'emp', actorId: 'mgr', status: 'approved' }).type).toBe('leave_approved')
    expect(leaveDecisionNotice({ employeeId: 'emp', actorId: 'mgr', status: 'rejected' }).type).toBe('leave_rejected')
  })
  it('goes to the employee and links to the leave page', () => {
    const r = rows([leaveDecisionNotice({ employeeId: 'emp', actorId: 'mgr', status: 'approved' })])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ user_id: 'emp', link: '/hrm/leave' })
  })
})
