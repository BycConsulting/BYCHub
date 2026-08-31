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

const leaveDayCount = z
  .string()
  .trim()
  .min(1, 'Leave day counts are required')
  .pipe(z.coerce.number<string>().int().min(0).max(365))

export const updateHrConfigSchema = z
  .object({
    workingMonday: z.boolean(),
    workingTuesday: z.boolean(),
    workingWednesday: z.boolean(),
    workingThursday: z.boolean(),
    workingFriday: z.boolean(),
    workingSaturday: z.boolean(),
    casualLeaveDays: leaveDayCount,
    sickLeaveDays: leaveDayCount,
    earnedLeaveDays: leaveDayCount,
    maternityLeaveDays: leaveDayCount,
    paternityLeaveDays: leaveDayCount,
    officeIpAllowlist: z.string().trim().max(2000),
  })
  .refine(
    (data) =>
      data.workingMonday ||
      data.workingTuesday ||
      data.workingWednesday ||
      data.workingThursday ||
      data.workingFriday ||
      data.workingSaturday,
    { message: 'At least one weekday must be a working day' }
  )

export const leaveRequestTypes = ['casual', 'sick', 'earned', 'maternity', 'paternity', 'wfh'] as const

export const submitLeaveRequestSchema = z
  .object({
    type: z.enum(leaveRequestTypes),
    startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date'),
    endDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date'),
    reason: z.string().trim().min(1, 'Reason is required').max(1000),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  })
  .refine((data) => data.startDate.slice(0, 4) === data.endDate.slice(0, 4), {
    message: 'A request cannot span two different years',
    path: ['endDate'],
  })

export const leaveRequestIdSchema = z.object({
  requestId: z.string().uuid(),
})

export const correctAttendanceSchema = z.object({
  recordId: z.string().uuid(),
  checkedInAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Enter a valid date and time')
    .optional()
    .or(z.literal('')),
  checkedOutAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Enter a valid date and time')
    .optional()
    .or(z.literal('')),
})

export const addHolidaySchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date'),
  name: z.string().trim().min(1, 'Holiday name is required').max(200),
})

export const holidayIdSchema = z.object({
  holidayId: z.string().uuid(),
})

export const createShiftSchema = z
  .object({
    name: z.string().trim().min(1, 'Shift name is required').max(100),
    startTime: z.string().trim().regex(/^\d{2}:\d{2}$/, 'Enter a valid time'),
    endTime: z.string().trim().regex(/^\d{2}:\d{2}$/, 'Enter a valid time'),
    workingMonday: z.boolean(),
    workingTuesday: z.boolean(),
    workingWednesday: z.boolean(),
    workingThursday: z.boolean(),
    workingFriday: z.boolean(),
    workingSaturday: z.boolean(),
  })
  .refine(
    (data) =>
      data.workingMonday ||
      data.workingTuesday ||
      data.workingWednesday ||
      data.workingThursday ||
      data.workingFriday ||
      data.workingSaturday,
    { message: 'At least one weekday must be a working day' }
  )

export const assignShiftSchema = z.object({
  userId: z.string().uuid(),
  shiftId: z.string().uuid().optional().or(z.literal('')),
})

export const startOnboardingSchema = z.object({
  userId: z.string().uuid(),
})

export const updateOnboardingChecklistSchema = z.object({
  checklistId: z.string().uuid(),
  stepOfferLetterSigned: z.boolean(),
  stepIdProofCollected: z.boolean(),
  stepEquipmentAssigned: z.boolean(),
  stepAccountsProvisioned: z.boolean(),
  stepOrientationCompleted: z.boolean(),
  stepDocumentsFiled: z.boolean(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
})

export const completeOnboardingSchema = z.object({
  checklistId: z.string().uuid(),
})

export const startOffboardingSchema = z.object({
  userId: z.string().uuid(),
})

export const updateOffboardingChecklistSchema = z.object({
  checklistId: z.string().uuid(),
  stepResignationRecorded: z.boolean(),
  stepExitInterviewDone: z.boolean(),
  stepAssetsReturned: z.boolean(),
  stepAccountsDeprovisioned: z.boolean(),
  stepFinalSettlementDone: z.boolean(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
})

export const completeOffboardingSchema = z.object({
  checklistId: z.string().uuid(),
})

export const candidateStages = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const

export const createOpeningSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  department: z.string().trim().max(200).optional().or(z.literal('')),
})

export const toggleOpeningStatusSchema = z.object({
  openingId: z.string().uuid(),
  status: z.enum(['open', 'closed']),
})

export const addCandidateSchema = z.object({
  openingId: z.string().uuid(),
  name: z.string().trim().min(1, 'Name is required').max(200),
  email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().trim().max(50).optional().or(z.literal('')),
  resumeNotes: z.string().trim().max(2000).optional().or(z.literal('')),
})

export const updateCandidateStageSchema = z.object({
  candidateId: z.string().uuid(),
  stage: z.enum(['applied', 'screening', 'interview', 'offer', 'hired']),
})

export const rejectCandidateSchema = z.object({
  candidateId: z.string().uuid(),
})

export const updateCandidateNotesSchema = z.object({
  candidateId: z.string().uuid(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
})

export const addClientMetricSchema = z.object({
  clientId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Pick a month'),
  channel: z.string().trim().min(1, 'Channel is required'),
  metricKey: z.string().trim().optional().or(z.literal('')),
  metricLabel: z.string().trim().min(1, 'Metric name is required'),
  value: z.coerce.number({ error: 'Value must be a number' }),
  unit: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
})

export const deleteClientMetricSchema = z.object({
  metricId: z.string().uuid(),
  clientId: z.string().uuid(),
})

export const taskStatuses = ['todo', 'in_progress', 'done'] as const

export const taskPriorities = ['low', 'medium', 'high', 'urgent'] as const

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  priority: z.enum(taskPriorities),
  assigneeId: z.string().uuid().optional().or(z.literal('')),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').optional().or(z.literal('')),
})

export const updateTaskStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(taskStatuses),
})

export const updateTaskSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  status: z.enum(taskStatuses),
  priority: z.enum(taskPriorities),
  assigneeId: z.string().uuid().optional().or(z.literal('')),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').optional().or(z.literal('')),
})

export const forceDeleteUserSchema = z.object({
  userId: z.string().uuid(),
  acknowledged: z.literal('on', { error: 'You must confirm you understand this permanently deletes their history' }),
})
