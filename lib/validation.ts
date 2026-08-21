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

export const deactivateUserSchema = z.object({
  userId: z.string().uuid(),
  reassignToUserId: z.string().uuid().optional(),
})

export const userIdSchema = z.object({
  userId: z.string().uuid(),
})

export const employeeProfileFields = [
  'phone',
  'address',
  'emergency_contact_name',
  'emergency_contact_phone',
  'date_of_birth',
] as const

export const employmentTypes = ['full_time', 'part_time', 'contract'] as const

export const submitProfileChangesSchema = z.object({
  phone: z.string().trim().max(200).optional().or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  emergencyContactName: z.string().trim().max(200).optional().or(z.literal('')),
  emergencyContactPhone: z.string().trim().max(200).optional().or(z.literal('')),
  dateOfBirth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')
    .optional()
    .or(z.literal('')),
})

export const reviewProfileRequestSchema = z.object({
  requestId: z.string().uuid(),
})

export const updateEmployeeProfileSchema = z.object({
  userId: z.string().uuid(),
  phone: z.string().trim().max(200).optional().or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  emergencyContactName: z.string().trim().max(200).optional().or(z.literal('')),
  emergencyContactPhone: z.string().trim().max(200).optional().or(z.literal('')),
  dateOfBirth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')
    .optional()
    .or(z.literal('')),
  designation: z.string().trim().max(200).optional().or(z.literal('')),
  department: z.string().trim().max(200).optional().or(z.literal('')),
  employmentStartDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')
    .optional()
    .or(z.literal('')),
  employmentType: z.enum(employmentTypes).optional().or(z.literal('')),
})
