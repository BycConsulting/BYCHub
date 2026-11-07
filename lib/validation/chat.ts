import { z } from 'zod'

export const chatProviders = ['claude', 'chatgpt'] as const

export const createConversationSchema = z.object({
  provider: z.enum(chatProviders),
})
