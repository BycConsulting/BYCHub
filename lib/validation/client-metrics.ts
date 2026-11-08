import { z } from 'zod'

export const addClientMetricSchema = z.object({
  clientId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Pick a month'),
  channel: z.string().trim().min(1, 'Channel is required'),
  metricKey: z.string().trim().optional().or(z.literal('')),
  metricLabel: z.string().trim().min(1, 'Metric name is required'),
  value: z.coerce.number({ error: 'Value must be a number' }).finite('Value must be a finite number'),
  unit: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
})

export const deleteClientMetricSchema = z.object({
  metricId: z.string().uuid(),
  clientId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Pick a month').optional().or(z.literal('')),
})
