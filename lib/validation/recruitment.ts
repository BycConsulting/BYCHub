import { z } from 'zod'

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
