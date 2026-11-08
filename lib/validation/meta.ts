import { z } from 'zod'

export const addAdAccountSchema = z.object({
  clientId: z.string().uuid(),
  adAccountId: z.string().trim().regex(/^act_\d+$/, 'Ad account IDs look like act_1234567890'),
  label: z.string().trim().max(80),
})

export const removeAdAccountSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
})

export const createReportSchema = z.object({
  clientId: z.string().uuid(),
  adAccountId: z.string().trim().regex(/^act_\d+$/, 'Pick an ad account'),
})

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')

export const refreshReportSchema = z
  .object({
    layoutId: z.string().uuid(),
    clientId: z.string().uuid(),
    from: isoDate,
    to: isoDate,
    compare: z.boolean(),
  })
  .refine((v) => v.from <= v.to, 'Start date must be before end date')
