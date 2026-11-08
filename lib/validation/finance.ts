import { z } from 'zod'

export const financeTransactionTypes = ['income', 'expense'] as const

export const createFinanceCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  type: z.enum(financeTransactionTypes),
})

export const financeCategoryIdSchema = z.object({
  categoryId: z.string().uuid(),
})

export const createFinanceTransactionSchema = z
  .object({
    type: z.enum(financeTransactionTypes),
    categoryId: z.string().uuid(),
    amount: z.coerce.number({ error: 'Amount must be a number' }).positive('Amount must be greater than zero'),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code')
      .optional()
      .or(z.literal('')),
    transactionDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')
      .optional()
      .or(z.literal('')),
    clientId: z.string().uuid().optional().or(z.literal('')),
    note: z.string().trim().max(1000).optional().or(z.literal('')),
  })
  .refine((data) => data.type === 'income' || !data.clientId, {
    message: 'Only income transactions can be linked to a client',
    path: ['clientId'],
  })

export const deleteFinanceTransactionSchema = z.object({
  transactionId: z.string().uuid(),
})
