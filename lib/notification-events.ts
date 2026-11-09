import type { NotificationInput } from './notifications'

const taskLink = (taskId: string) => `/hrm/tasks/${taskId}`

export function taskAssignmentNotices(a: {
  taskId: string
  title: string
  actorId: string
  previousOwnerId: string | null
  ownerId: string | null
  previousSupportIds: string[]
  supportIds: string[]
}): NotificationInput[] {
  const notices: NotificationInput[] = []

  if (a.ownerId && a.ownerId !== a.previousOwnerId) {
    notices.push({
      type: 'task_assigned',
      title: `You were assigned: ${a.title}`,
      link: taskLink(a.taskId),
      actorId: a.actorId,
      recipientIds: [a.ownerId],
    })
  }

  const added = a.supportIds.filter((id) => !a.previousSupportIds.includes(id))
  if (added.length > 0) {
    notices.push({
      type: 'task_support',
      title: `You were added as support: ${a.title}`,
      link: taskLink(a.taskId),
      actorId: a.actorId,
      recipientIds: added,
    })
  }

  return notices
}

export function taskStatusNotices(a: {
  taskId: string
  title: string
  actorId: string
  previousStatus: string | null
  status: string
  ownerId: string | null
  creatorId: string | null
}): NotificationInput[] {
  if (a.status === a.previousStatus) return []
  if (a.status !== 'blocked' && a.status !== 'done') return []

  return [
    {
      type: a.status === 'blocked' ? 'task_blocked' : 'task_completed',
      title: `${a.status === 'blocked' ? 'Task blocked' : 'Task completed'}: ${a.title}`,
      link: taskLink(a.taskId),
      actorId: a.actorId,
      recipientIds: [a.ownerId, a.creatorId],
    },
  ]
}

export function taskCommentNotices(a: {
  taskId: string
  title: string
  actorId: string
  ownerId: string | null
  creatorId: string | null
  supportIds: string[]
}): NotificationInput[] {
  return [
    {
      type: 'task_comment',
      title: `New comment on: ${a.title}`,
      link: taskLink(a.taskId),
      actorId: a.actorId,
      recipientIds: [a.ownerId, a.creatorId, ...a.supportIds],
    },
  ]
}

export function leaveSubmittedNotices(a: {
  requestId: string
  employeeId: string
  employeeName: string
  managerId: string | null
  hrIds: string[]
}): NotificationInput[] {
  return [
    {
      type: 'leave_pending',
      title: `${a.employeeName} requested leave`,
      body: 'Review it and approve or reject.',
      link: a.managerId ? '/hrm/leave' : '/hrm/leave/requests',
      actorId: a.employeeId,
      recipientIds: a.managerId ? [a.managerId] : a.hrIds,
    },
  ]
}

export function leaveDecisionNotice(a: {
  employeeId: string
  actorId: string
  status: 'approved' | 'rejected'
}): NotificationInput {
  return {
    type: a.status === 'approved' ? 'leave_approved' : 'leave_rejected',
    title: `Your leave request was ${a.status}`,
    link: '/hrm/leave',
    actorId: a.actorId,
    recipientIds: [a.employeeId],
  }
}
