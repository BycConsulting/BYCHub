import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { allocationForType, computeBalance, dayCount, LEAVE_TYPE_LABELS } from '@/lib/leave'
import { approveLeaveRequest, rejectLeaveRequest } from './actions'
import { ConfirmSubmitButton } from '@/app/(app)/confirm-submit-button'

export default async function LeaveRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await requireModule('hr')
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: pendingRequests, error: pendingError } = await admin
    .from('leave_requests')
    .select('id, user_id, type, start_date, end_date, reason, created_at')
    .eq('status', 'pending')
    .neq('user_id', currentUser.id)
    .order('created_at', { ascending: true })

  const pending = pendingRequests ?? []
  const userIds = [...new Set(pending.map((request) => request.user_id))]

  const { data: users } =
    userIds.length > 0 ? await admin.from('users').select('id, name').in('id', userIds) : { data: [] }
  const nameById = new Map((users ?? []).map((user) => [user.id, user.name]))

  const { data: config, error: configError } = await admin.from('hr_config').select('*').eq('id', true).single()

  const { data: approvedRequests } =
    userIds.length > 0
      ? await admin.from('leave_requests').select('user_id, type, start_date, end_date').eq('status', 'approved')
      : { data: [] }

  const approvedByUserAndType = new Map<string, { start_date: string; end_date: string }[]>()
  for (const request of approvedRequests ?? []) {
    const key = `${request.user_id}:${request.type}`
    const list = approvedByUserAndType.get(key) ?? []
    list.push({ start_date: request.start_date, end_date: request.end_date })
    approvedByUserAndType.set(key, list)
  }

  const currentYear = new Date().getFullYear()

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Pending leave & WFH requests</h1>
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
      {pendingError ? (
        <p className="rounded bg-red-50 p-2 text-sm text-red-600">Could not load pending requests</p>
      ) : pending.length === 0 ? (
        <p className="text-sm text-gray-500">No pending requests.</p>
      ) : (
        <ul className="space-y-3">
          {pending.map((request) => {
            const allocation = config ? allocationForType(config, request.type) : null
            const balanceText =
              configError && request.type !== 'wfh'
                ? 'balance unavailable'
                : allocation !== null
                  ? `current balance: ${computeBalance(
                      allocation,
                      approvedByUserAndType.get(`${request.user_id}:${request.type}`) ?? [],
                      currentYear
                    )}`
                  : null

            return (
              <li key={request.id} className="rounded border p-4">
                <p className="text-sm font-medium">
                  {nameById.get(request.user_id) ?? 'Unknown'} — {LEAVE_TYPE_LABELS[request.type]}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  {request.start_date} to {request.end_date} ({dayCount(request.start_date, request.end_date)} day
                  {dayCount(request.start_date, request.end_date) === 1 ? '' : 's'})
                  {balanceText && <> — {balanceText}</>}
                </p>
                <p className="text-sm text-gray-600">{request.reason}</p>
                <div className="mt-2 flex gap-3">
                  <form action={approveLeaveRequest}>
                    <input type="hidden" name="requestId" value={request.id} />
                    <ConfirmSubmitButton
                      confirmMessage="Approve this request? This cannot be undone."
                      className="text-green-700 underline"
                    >
                      Approve
                    </ConfirmSubmitButton>
                  </form>
                  <form action={rejectLeaveRequest}>
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
  )
}
