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
