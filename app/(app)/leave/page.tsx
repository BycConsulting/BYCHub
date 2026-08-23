import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { allocationForType, computeBalance, dayCount, LEAVE_TYPE_LABELS } from '@/lib/leave'
import { submitLeaveRequest, cancelLeaveRequest } from './actions'
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
    </div>
  )
}
