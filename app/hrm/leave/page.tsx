import type { PostgrestError } from '@supabase/supabase-js'
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { allocationForType, computeBalance, dayCount, LEAVE_TYPE_LABELS } from '@/lib/leave'
import { submitLeaveRequest, cancelLeaveRequest } from './actions'
import { approveTeamRequest, rejectTeamRequest } from './team-actions'
import { ConfirmSubmitButton } from '@/app/(app)/confirm-submit-button'
import type { LeaveRequestType } from '@/types/database'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormSelect } from '@/components/ui/form-select'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

const BALANCE_TYPES: LeaveRequestType[] = ['casual', 'sick', 'earned', 'maternity', 'paternity']

const LEAVE_TYPE_OPTIONS = Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => ({ value, label }))

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'approved') return 'default'
  if (status === 'rejected') return 'destructive'
  return 'secondary'
}

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await requireModule('leave_attendance')
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

  const { data: myReports, error: reportsError } = await admin
    .from('employee_profiles')
    .select('user_id')
    .eq('manager_id', currentUser.id)
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
  const teamApprovedByUserAndType = new Map<string, { start_date: string; end_date: string }[]>()
  let teamPendingError: PostgrestError | null = null
  let teamApprovedError: PostgrestError | null = null

  if (reportIds.length > 0) {
    const { data: pending, error: pendingErr } = await admin
      .from('leave_requests')
      .select('id, user_id, type, start_date, end_date, reason, created_at')
      .in('user_id', reportIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    teamPending = pending ?? []
    teamPendingError = pendingErr

    const { data: reportUsers } = await admin.from('users').select('id, name').in('id', reportIds)
    teamNameById = new Map((reportUsers ?? []).map((user) => [user.id, user.name]))

    const { data: teamApproved, error: approvedErr } = await admin
      .from('leave_requests')
      .select('user_id, type, start_date, end_date')
      .in('user_id', reportIds)
      .eq('status', 'approved')
    teamApprovedError = approvedErr
    for (const request of teamApproved ?? []) {
      const key = `${request.user_id}:${request.type}`
      const list = teamApprovedByUserAndType.get(key) ?? []
      list.push({ start_date: request.start_date, end_date: request.end_date })
      teamApprovedByUserAndType.set(key, list)
    }
  }

  const canManageHolidays = currentUser.role === 'hr' || currentUser.role === 'admin'

  return (
    <div className="space-y-8">
      <div className="flex gap-4">
        <Link href="/hrm/leave/calendar" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
          Calendar
        </Link>
        {canManageHolidays && (
          <Link href="/hrm/leave/holidays" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
            Holidays
          </Link>
        )}
        {canManageHolidays && (
          <Link href="/hrm/leave/requests" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
            Pending requests
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Leave & WFH</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
          )}

          {configError ? (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
              Could not load leave balances
            </p>
          ) : (
            config && (
              <div className="mb-4">
                <h2 className="text-sm font-medium text-slate-500">My balance ({currentYear})</h2>
                <div className="mt-2 grid grid-cols-5 gap-3">
                  {BALANCE_TYPES.map((type) => {
                    const allocation = allocationForType(config, type)
                    const balance = computeBalance(allocation ?? 0, approvedByType.get(type) ?? [], currentYear)
                    return (
                      <div key={type} className="rounded-lg border border-slate-200 p-3 text-sm">
                        <div className="text-slate-500">{LEAVE_TYPE_LABELS[type]}</div>
                        <div className="text-lg font-semibold text-slate-800">{balance}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          )}

          <form action={submitLeaveRequest} className="grid grid-cols-2 gap-3">
            <FormSelect name="type" options={LEAVE_TYPE_OPTIONS} defaultValue={LEAVE_TYPE_OPTIONS[0]?.value} />
            <div />
            <Input type="date" name="startDate" required />
            <Input type="date" name="endDate" required />
            <Textarea name="reason" placeholder="Reason" required className="col-span-2" />
            <Button type="submit" className="col-span-2">
              Submit request
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardHeader className="pt-4">
          <CardTitle className="text-lg">My requests</CardTitle>
        </CardHeader>
        {requestsError ? (
          <CardContent className="pb-4">
            <p className="text-sm text-red-700">Could not load your requests</p>
          </CardContent>
        ) : myRequests && myRequests.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {myRequests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <Badge variant="outline">{LEAVE_TYPE_LABELS[request.type]}</Badge>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {request.start_date} to {request.end_date} ({dayCount(request.start_date, request.end_date)} day
                    {dayCount(request.start_date, request.end_date) === 1 ? '' : 's'})
                  </TableCell>
                  <TableCell className="whitespace-normal text-slate-500">{request.reason}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(request.status)} className="capitalize">
                      {request.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {request.status === 'pending' && (
                      <form action={cancelLeaveRequest}>
                        <input type="hidden" name="requestId" value={request.id} />
                        <button type="submit" className="text-red-600 underline">
                          Cancel
                        </button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardContent className="pb-4">
            <p className="text-sm text-slate-500">No requests yet.</p>
          </CardContent>
        )}
      </Card>

      {(reportsError || reportIds.length > 0) && (
        <Card className="py-0">
          <CardHeader className="pt-4">
            <CardTitle className="text-lg">My team&apos;s requests</CardTitle>
          </CardHeader>
          {reportsError ? (
            <CardContent className="pb-4">
              <p className="text-sm text-red-700">Could not load your team</p>
            </CardContent>
          ) : teamPendingError ? (
            <CardContent className="pb-4">
              <p className="text-sm text-red-700">Could not load your team&apos;s requests</p>
            </CardContent>
          ) : teamPending.length === 0 ? (
            <CardContent className="pb-4">
              <p className="text-sm text-slate-500">No pending requests from your team.</p>
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamPending.map((request) => {
                  const allocation = config ? allocationForType(config, request.type) : null
                  const balanceText =
                    (configError || teamApprovedError) && request.type !== 'wfh'
                      ? 'balance unavailable'
                      : allocation !== null
                        ? `current balance: ${computeBalance(
                            allocation,
                            teamApprovedByUserAndType.get(`${request.user_id}:${request.type}`) ?? [],
                            currentYear
                          )}`
                        : null

                  return (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium text-slate-800">
                        {teamNameById.get(request.user_id) ?? 'Unknown'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{LEAVE_TYPE_LABELS[request.type]}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {request.start_date} to {request.end_date} ({dayCount(request.start_date, request.end_date)}{' '}
                        day{dayCount(request.start_date, request.end_date) === 1 ? '' : 's'})
                      </TableCell>
                      <TableCell className="whitespace-normal text-slate-600">{balanceText ?? '—'}</TableCell>
                      <TableCell className="whitespace-normal text-slate-600">{request.reason}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <form action={approveTeamRequest}>
                            <input type="hidden" name="requestId" value={request.id} />
                            <ConfirmSubmitButton
                              confirmMessage="Approve this request? This cannot be undone."
                              className={buttonVariants({ variant: 'default' })}
                            >
                              Approve
                            </ConfirmSubmitButton>
                          </form>
                          <form action={rejectTeamRequest}>
                            <input type="hidden" name="requestId" value={request.id} />
                            <ConfirmSubmitButton
                              confirmMessage="Reject this request? This cannot be undone."
                              className={buttonVariants({ variant: 'destructive' })}
                            >
                              Reject
                            </ConfirmSubmitButton>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  )
}
