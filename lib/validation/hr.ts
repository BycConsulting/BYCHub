import { z } from 'zod'

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
