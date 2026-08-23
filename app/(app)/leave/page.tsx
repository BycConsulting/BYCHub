import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { allocationForType, computeBalance, dayCount, LEAVE_TYPE_LABELS } from '@/lib/leave'
import { submitLeaveRequest, cancelLeaveRequest } from './actions'
import { approveTeamRequest, rejectTeamRequest } from './team-actions'
import { ConfirmSubmitButton } from '@/app/(app)/confirm-submit-button'
import type { LeaveRequestType } from '@/types/database'

const BALANCE_TYPES: LeaveRequestType[] = ['casual', 'sick', 'earned', 'maternity', 'paternity']

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await requireUser()
  const { error } = await searchParams

  const supabase = await createClient()
  const admin = createAdminSupabaseClient()

  const { data: myRequests, error: requestsError } = await supabase
    .from('leave_requests')
    .select('id, type, start_date, end_date, reason, status, created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })

  const { data: config, error: configError } = await admin.from('hr_config').select('*').eq('id', true).single()

  const approvedByType = new Map<LeaveRequestType, { start_date: string; end_date: string }[]>()
  for (const request of myRequests ?? []) {
    if (request.status !== 'approved') continue
    const list = approvedByType.get(request.type) ?? []
    list.push({ start_date: request.start_date, end_date: request.end_date })
    approvedByType.set(request.type, list)
  }

  const currentYear = new Date().getFullYear()

  const { data: myReports } = await admin.from('employee_profiles').select('user_id').eq('manager_id', currentUser.id)
  const reportIds = (myReports ?? []).map((report) => report.user_id)

  let teamPending: {
    id: string
    user_id: string
    type: LeaveRequestType
    start_date: string
    end_date: string
    reason: string
    created_at: string
  }[] = []
  let teamNameById = new Map<string, string>()
  let teamApprovedByUserAndType = new Map<string, { start_date: string; end_date: string }[]>()

  if (reportIds.length > 0) {
    const { data: pending } = await admin
      .from('leave_requests')
      .select('id, user_id, type, start_date, end_date, reason, created_at')
      .in('user_id', reportIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    teamPending = pending ?? []

    const { data: reportUsers } = await admin.from('users').select('id, name').in('id', reportIds)
    teamNameById = new Map((reportUsers ?? []).map((user) => [user.id, user.name]))

    const { data: teamApproved } = await admin
      .from('leave_requests')
      .select('user_id, type, start_date, end_date')
      .in('user_id', reportIds)
      .eq('status', 'approved')
    for (const request of teamApproved ?? []) {
      const key = `${request.user_id}:${request.type}`
      const list = teamApprovedByUserAndType.get(key) ?? []
      list.push({ start_date: request.start_date, end_date: request.end_date })
      teamApprovedByUserAndType.set(key, list)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Leave & WFH</h1>
        {error && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        {configError ? (
          <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-600">Could not load leave balances</p>
        ) : (
          config && (
            <div className="mt-3">
              <h2 className="text-sm font-medium text-gray-500">My balance ({currentYear})</h2>
              <div className="mt-2 grid grid-cols-5 gap-3">
                {BALANCE_TYPES.map((type) => {
                  const allocation = allocationForType(config, type)
                  const balance = computeBalance(allocation ?? 0, approvedByType.get(type) ?? [], currentYear)
                  return (
                    <div key={type} className="rounded border p-3 text-sm">
                      <div className="text-gray-500">{LEAVE_TYPE_LABELS[type]}</div>
                      <div className="text-lg font-semibold">{balance}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        )}

        <form action={submitLeaveRequest} className="mt-4 grid grid-cols-2 gap-3">
          <select name="type" className="rounded border px-3 py-2">
            {Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div />
          <input type="date" name="startDate" required className="rounded border px-3 py-2" />
          <input type="date" name="endDate" required className="rounded border px-3 py-2" />
          <textarea
            name="reason"
            placeholder="Reason"
            required
            className="col-span-2 rounded border px-3 py-2"
          />
          <button type="submit" className="col-span-2 rounded bg-black py-2 text-white">
            Submit request
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-lg font-semibold">My requests</h2>
        {requestsError ? (
          <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">Could not load your requests</p>
        ) : myRequests && myRequests.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {myRequests.map((request) => (
              <li key={request.id} className="rounded border p-3 text-sm">
                <div>
                  {LEAVE_TYPE_LABELS[request.type]}: {request.start_date} to {request.end_date} (
                  {dayCount(request.start_date, request.end_date)} day
                  {dayCount(request.start_date, request.end_date) === 1 ? '' : 's'}) —{' '}
                  <strong>{request.status}</strong>
                </div>
                <div className="text-gray-500">{request.reason}</div>
                {request.status === 'pending' && (
                  <form action={cancelLeaveRequest} className="mt-1">
                    <input type="hidden" name="requestId" value={request.id} />
                    <button type="submit" className="text-red-600 underline">
                      Cancel
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-gray-500">No requests yet.</p>
        )}
      </div>

      {reportIds.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold">My team&apos;s requests</h2>
          {teamPending.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No pending requests from your team.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {teamPending.map((request) => {
                const allocation = config ? allocationForType(config, request.type) : null
                const balanceText =
                  configError && request.type !== 'wfh'
                    ? 'balance unavailable'
                    : allocation !== null
                      ? `current balance: ${computeBalance(
                          allocation,
                          teamApprovedByUserAndType.get(`${request.user_id}:${request.type}`) ?? [],
                          currentYear
                        )}`
                      : null

                return (
                  <li key={request.id} className="rounded border p-4">
                    <p className="text-sm font-medium">
                      {teamNameById.get(request.user_id) ?? 'Unknown'} — {LEAVE_TYPE_LABELS[request.type]}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      {request.start_date} to {request.end_date} ({dayCount(request.start_date, request.end_date)}{' '}
                      day{dayCount(request.start_date, request.end_date) === 1 ? '' : 's'})
                      {balanceText && <> — {balanceText}</>}
                    </p>
                    <p className="text-sm text-gray-600">{request.reason}</p>
                    <div className="mt-2 flex gap-3">
                      <form action={approveTeamRequest}>
                        <input type="hidden" name="requestId" value={request.id} />
                        <ConfirmSubmitButton
                          confirmMessage="Approve this request? This cannot be undone."
                          className="text-green-700 underline"
                        >
                          Approve
                        </ConfirmSubmitButton>
                      </form>
                      <form action={rejectTeamRequest}>
                        <input type="hidden" name="requestId" value={request.id} />
                        <ConfirmSubmitButton
                          confirmMessage="Reject this request? This cannot be undone."
                          className="text-red-600 underline"
                        >
                          Reject
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
