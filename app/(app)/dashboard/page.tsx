import { createClient } from '@/lib/supabase/server'
import {
  leadStageOrder,
  countLeadsByStage,
  countLeadsBySource,
  computeWinRate,
  countClientsByStatus,
  computeAvgTimeToWonDays,
  countActivitiesByUser,
} from '@/lib/metrics'
import { requireModule } from '@/lib/access'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const clientStatusOrder = ['prospect', 'active', 'paused', 'lost'] as const

export default async function DashboardPage() {
  await requireModule('dashboard')
  const supabase = await createClient()

  const [leadsRes, clientsRes, activitiesRes, usersRes] = await Promise.all([
    supabase.from('leads').select('id, stage, source, created_at', { count: 'exact' }),
    supabase.from('clients').select('status', { count: 'exact' }),
    supabase
      .from('activities')
      .select('lead_id, type, body, user_id, created_at', { count: 'exact' })
      .order('created_at', { ascending: true }),
    supabase.from('users').select('id, name', { count: 'exact' }),
  ])

  const queryError = leadsRes.error || clientsRes.error || activitiesRes.error || usersRes.error
  if (queryError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load dashboard data: {queryError.message}
      </div>
    )
  }

  const leads = leadsRes.data ?? []
  const clients = clientsRes.data ?? []
  const activities = activitiesRes.data ?? []
  const users = usersRes.data ?? []

  const isTruncated =
    (leadsRes.count ?? leads.length) > leads.length ||
    (clientsRes.count ?? clients.length) > clients.length ||
    (activitiesRes.count ?? activities.length) > activities.length ||
    (usersRes.count ?? users.length) > users.length

  const byStage = countLeadsByStage(leads)
  const bySource = countLeadsBySource(leads)
  const winRate = computeWinRate(leads)
  const byStatus = countClientsByStatus(clients)
  const avgDays = computeAvgTimeToWonDays(leads, activities)
  const byUser = countActivitiesByUser(activities, users)

  const maxStageCount = Math.max(1, ...Object.values(byStage))
  const maxSourceCount = Math.max(1, ...bySource.map((entry) => entry.count))
  const maxUserCount = Math.max(1, ...byUser.map((entry) => entry.count))

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-slate-800">Dashboard</h1>

      {isTruncated && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          Showing partial data — some rows were not loaded. Numbers below may be incomplete or inaccurate.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent>
            <div className="text-sm text-slate-500">Total leads</div>
            <div className="text-2xl font-semibold text-slate-800">{leads.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="text-sm text-slate-500">Win rate</div>
            <div className="text-2xl font-semibold text-slate-800">
              {winRate === null ? '—' : `${winRate.toFixed(0)}%`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="text-sm text-slate-500">Avg time to won</div>
            <div className="text-2xl font-semibold text-slate-800">
              {avgDays === null ? '—' : `${avgDays.toFixed(1)}d`}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Leads by stage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {leadStageOrder.map((stage) => (
              <div key={stage} className="flex items-center gap-2">
                <div className="w-24 text-sm capitalize text-slate-600">{stage}</div>
                <div className="h-4 flex-1 rounded bg-slate-100">
                  <div
                    className="h-4 rounded bg-slate-800"
                    style={{ width: `${(byStage[stage] / maxStageCount) * 100}%` }}
                  />
                </div>
                <div className="w-8 text-right text-sm text-slate-600">{byStage[stage]}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Leads by source</CardTitle>
        </CardHeader>
        <CardContent>
          {bySource.length === 0 ? (
            <p className="text-sm text-slate-500">No data yet.</p>
          ) : (
            <div className="space-y-2">
              {bySource.map(({ source, count }) => (
                <div key={source} className="flex items-center gap-2">
                  <div className="w-24 truncate text-sm text-slate-600">{source}</div>
                  <div className="h-4 flex-1 rounded bg-slate-100">
                    <div
                      className="h-4 rounded bg-slate-800"
                      style={{ width: `${(count / maxSourceCount) * 100}%` }}
                    />
                  </div>
                  <div className="w-8 text-right text-sm text-slate-600">{count}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold text-slate-800">Clients by status</h2>
        <div className="mt-3 grid grid-cols-4 gap-4">
          {clientStatusOrder.map((status) => (
            <Card key={status}>
              <CardContent>
                <div className="text-sm capitalize text-slate-500">{status}</div>
                <div className="text-xl font-semibold text-slate-800">{byStatus[status]}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity by teammate</CardTitle>
        </CardHeader>
        <CardContent>
          {byUser.length === 0 ? (
            <p className="text-sm text-slate-500">No activity yet.</p>
          ) : (
            <div className="space-y-2">
              {byUser.map(({ userId, name, count }) => (
                <div key={userId} className="flex items-center gap-2">
                  <div className="w-24 truncate text-sm text-slate-600">{name}</div>
                  <div className="h-4 flex-1 rounded bg-slate-100">
                    <div
                      className="h-4 rounded bg-slate-800"
                      style={{ width: `${(count / maxUserCount) * 100}%` }}
                    />
                  </div>
                  <div className="w-8 text-right text-sm text-slate-600">{count}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
