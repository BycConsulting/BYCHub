import type { Database, LeaveRequestType } from '@/types/database'

export const LEAVE_TYPE_LABELS: Record<LeaveRequestType, string> = {
  casual: 'Casual Leave',
  sick: 'Sick Leave',
  earned: 'Earned/Privilege Leave',
  maternity: 'Maternity Leave',
  paternity: 'Paternity Leave',
  wfh: 'Work From Home',
}

/** Inclusive day count between two YYYY-MM-DD date strings. */
export function dayCount(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1
}

/** Whether two inclusive YYYY-MM-DD date ranges overlap at all. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd
}

type HrConfigRow = Database['public']['Tables']['hr_config']['Row']

/** The annual allocation for a leave type, or null for `wfh` (which has no balance). */
export function allocationForType(config: HrConfigRow, type: LeaveRequestType): number | null {
  switch (type) {
    case 'casual':
      return config.casual_leave_days
    case 'sick':
      return config.sick_leave_days
    case 'earned':
      return config.earned_leave_days
    case 'maternity':
      return config.maternity_leave_days
    case 'paternity':
      return config.paternity_leave_days
    case 'wfh':
      return null
  }
}

/**
 * Remaining balance for one leave type in one calendar year: the annual
 * allocation minus the day-counts of every approved request of that type
 * whose `start_date` falls in `year`. Can go negative — balance is
 * advisory, never a submission-time cap (see the design spec).
 */
export function computeBalance(
  allocation: number,
  approvedRequestsOfType: { start_date: string; end_date: string }[],
  year: number
): number {
  const usedDays = approvedRequestsOfType
    .filter((request) => Number(request.start_date.slice(0, 4)) === year)
    .reduce((sum, request) => sum + dayCount(request.start_date, request.end_date), 0)
  return allocation - usedDays
}
