import { z } from 'zod'

export const taskStatuses = ['started', 'in_progress', 'blocked', 'done'] as const

export const taskPriorities = ['low', 'medium', 'high', 'urgent'] as const

const requiredDate = (label: string) =>
  z.string().min(1, `${label} is required`).regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')

export const taskFieldsSchema = z
  .object({
    clientId: z.string().uuid().optional().or(z.literal('')),
    projectId: z.string().uuid('Project is required'),
    title: z.string().trim().min(1, 'Title is required').max(200),
    description: z.string().trim().min(1, 'Description is required').max(4000),
    expectedOutput: z.string().trim().min(1, 'Expected output is required').max(2000),
    assigneeId: z.string().uuid('Task owner is required'),
    supportIds: z.array(z.string().uuid()),
    noSupport: z.boolean(),
    priority: z.enum(taskPriorities),
    estimatedHours: z.coerce.number('Estimated effort is required').positive('Estimated effort is required').max(1000),
    dependencyTaskIds: z.array(z.string().uuid()),
    dependencyNote: z.string().trim().max(1000),
    noDependencies: z.boolean(),
    startDate: requiredDate('Start date'),
    endDate: requiredDate('End date'),
    status: z.enum(taskStatuses),
    blockerReason: z.string().trim().max(1000),
  })
  .superRefine((v, ctx) => {
    if (!v.noSupport && v.supportIds.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Pick support, or tick "No support needed"' })
    }
    if (!v.noDependencies && v.dependencyTaskIds.length === 0 && !v.dependencyNote) {
      ctx.addIssue({ code: 'custom', message: 'Add dependencies, or tick "No dependencies"' })
    }
    if (v.endDate < v.startDate) {
      ctx.addIssue({ code: 'custom', message: 'End date cannot be before start date' })
    }
    if (v.status === 'blocked' && !v.blockerReason) {
      ctx.addIssue({ code: 'custom', message: 'Say what is pending and who needs to act' })
    }
  })

export function parseTaskForm(formData: FormData) {
  const text = (key: string) => formData.get(key) ?? ''
  return taskFieldsSchema.safeParse({
    clientId: text('clientId'),
    projectId: text('projectId'),
    title: text('title'),
    description: text('description'),
    expectedOutput: text('expectedOutput'),
    assigneeId: text('assigneeId'),
    supportIds: formData.getAll('supportIds'),
    noSupport: formData.get('noSupport') === 'on',
    priority: text('priority'),
    estimatedHours: text('estimatedHours'),
    dependencyTaskIds: formData.getAll('dependencyTaskIds'),
    dependencyNote: text('dependencyNote'),
    noDependencies: formData.get('noDependencies') === 'on',
    startDate: text('startDate'),
    endDate: text('endDate'),
    status: text('status') || 'started',
    blockerReason: text('blockerReason'),
  })
}

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(120),
  clientId: z.string().uuid().optional().or(z.literal('')),
})

export const updateTaskStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(taskStatuses),
  note: z.string().trim().max(4000).optional(),
})

export const addTaskCommentSchema = z.object({
  taskId: z.string().uuid(),
  body: z.string().trim().min(1, 'Comment cannot be empty').max(4000),
})
