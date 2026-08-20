import type { LeadStage, ClientStatus } from '@/types/database'

export interface LeadRow {
  id: string
  stage: LeadStage
  source: string | null
  created_at: string
}

export interface ClientRow {
  status: ClientStatus
}

export interface ActivityRow {
  lead_id: string | null
  type: string
  body: string | null
  user_id: string
  created_at: string
}

export interface UserRow {
  id: string
  name: string
}

export const leadStageOrder: readonly LeadStage[] = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'won',
  'lost',
]

export function countLeadsByStage(leads: LeadRow[]): Record<LeadStage, number> {
  const counts: Record<LeadStage, number> = {
    new: 0,
    contacted: 0,
    qualified: 0,
    proposal: 0,
    won: 0,
    lost: 0,
  }
  for (const lead of leads) {
    counts[lead.stage] += 1
  }
  return counts
}

export function countLeadsBySource(leads: LeadRow[]): { source: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const lead of leads) {
    const key = lead.source?.trim() || 'Unknown'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
}

export function computeWinRate(leads: LeadRow[]): number | null {
  const won = leads.filter((lead) => lead.stage === 'won').length
  const lost = leads.filter((lead) => lead.stage === 'lost').length
  const total = won + lost
  if (total === 0) return null
  return (won / total) * 100
}

export function countClientsByStatus(clients: ClientRow[]): Record<ClientStatus, number> {
  const counts: Record<ClientStatus, number> = {
    prospect: 0,
    active: 0,
    paused: 0,
    lost: 0,
  }
  for (const client of clients) {
    counts[client.status] += 1
  }
  return counts
}

export function computeAvgTimeToWonDays(leads: LeadRow[], activities: ActivityRow[]): number | null {
  const wonLeads = leads.filter((lead) => lead.stage === 'won')
  const durations: number[] = []

  for (const lead of wonLeads) {
    const wonActivity = activities.find(
      (activity) =>
        activity.lead_id === lead.id &&
        activity.type === 'stage_change' &&
        activity.body === 'Stage changed to won'
    )
    if (!wonActivity) continue

    const createdMs = new Date(lead.created_at).getTime()
    const wonMs = new Date(wonActivity.created_at).getTime()
    const days = (wonMs - createdMs) / (1000 * 60 * 60 * 24)
    if (days >= 0) durations.push(days)
  }

  if (durations.length === 0) return null
  return durations.reduce((sum, days) => sum + days, 0) / durations.length
}

export function countActivitiesByUser(
  activities: ActivityRow[],
  users: UserRow[]
): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const activity of activities) {
    counts.set(activity.user_id, (counts.get(activity.user_id) ?? 0) + 1)
  }

  const nameById = new Map(users.map((user) => [user.id, user.name]))

  return Array.from(counts.entries())
    .map(([userId, count]) => ({ name: nameById.get(userId) ?? 'Unknown', count }))
    .sort((a, b) => b.count - a.count)
}
