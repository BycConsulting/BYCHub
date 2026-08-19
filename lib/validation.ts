import { z } from 'zod'

export const leadStages = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'] as const
export const clientStatuses = ['prospect', 'active', 'paused', 'lost'] as const
export const activityTypes = ['note', 'call', 'email', 'stage_change'] as const

export const createLeadSchema = z.object({
  contact_name: z.string().trim().min(1, 'Contact name is required'),
  contact_email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  contact_company: z.string().trim().optional().or(z.literal('')),
  source: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
})

export const updateStageSchema = z.object({
  leadId: z.string().uuid(),
  stage: z.enum(leadStages),
})

export const addActivitySchema = z
  .object({
    leadId: z.string().uuid().optional(),
    clientId: z.string().uuid().optional(),
    type: z.enum(activityTypes),
    body: z.string().trim().min(1, 'Activity body is required'),
  })
  .refine((data) => data.leadId || data.clientId, {
    message: 'Activity must be attached to a lead or a client',
  })

export const inviteUserSchema = z.object({
  email: z.string().trim().email('Invalid email'),
  name: z.string().trim().min(1, 'Name is required'),
  role: z.enum(['admin', 'employee']),
})
