import { z } from 'zod'

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
