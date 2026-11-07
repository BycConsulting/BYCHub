import { z } from 'zod'

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
