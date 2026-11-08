import { z } from 'zod'

export const inviteUserSchema = z.object({
  email: z.string().trim().email('Invalid email'),
  name: z.string().trim().min(1, 'Name is required'),
  role: z.enum(['admin', 'hr', 'employee']),
})

export const deactivateUserSchema = z.object({
  userId: z.string().uuid(),
  reassignToUserId: z.string().uuid().optional(),
})

export const userIdSchema = z.object({
  userId: z.string().uuid(),
})

export const employmentTypes = ['full_time', 'part_time', 'contract'] as const

export const updateEmployeeProfileSchema = z
  .object({
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
    managerId: z.string().uuid().optional().or(z.literal('')),
  })
  .refine((data) => !data.managerId || data.managerId !== data.userId, {
    message: 'An employee cannot be their own manager',
    path: ['managerId'],
  })

export const configurableRoles = ['hr', 'employee'] as const

export const moduleKeys = ['dashboard', 'leads', 'clients', 'hr', 'settings', 'directory', 'leave_attendance', 'onboarding', 'offboarding', 'recruitment', 'tasks'] as const

export const updateModuleAccessSchema = z.object({
  enabled: z.array(z.string()),
})

export const forceDeleteUserSchema = z.object({
  userId: z.string().uuid(),
  acknowledged: z.literal('on', { error: 'You must confirm you understand this permanently deletes their history' }),
})
