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

const clientStatusOrder = ['prospect', 'active', 'paused', 'lost'] as const

export default async function DashboardPage() {
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
      <div className="rounded bg-red-50 p-4 text-sm text-red-600">
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
      <h1 className="text-lg font-semibold">Dashboard</h1>

      {isTruncated && (
        <div className="rounded bg-yellow-50 p-3 text-sm text-yellow-800">
          Showing partial data — some rows were not loaded. Numbers below may be understated.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">Total leads</div>
          <div className="text-2xl font-semibold">{leads.length}</div>
        </div>
        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">Win rate</div>
          <div className="text-2xl font-semibold">
            {winRate === null ? '—' : `${winRate.toFixed(0)}%`}
          </div>
        </div>
        <div className="rounded border p-4">
          <div className="text-sm text-gray-500">Avg time to won</div>
          <div className="text-2xl font-semibold">
            {avgDays === null ? '—' : `${avgDays.toFixed(1)}d`}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Leads by stage</h2>
        <div className="mt-3 space-y-2">
          {leadStageOrder.map((stage) => (
            <div key={stage} className="flex items-center gap-2">
              <div className="w-24 text-sm capitalize">{stage}</div>
              <div className="h-4 flex-1 rounded bg-gray-100">
                <div
                  className="h-4 rounded bg-black"
                  style={{ width: `${(byStage[stage] / maxStageCount) * 100}%` }}
                />
              </div>
              <div className="w-8 text-right text-sm">{byStage[stage]}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Leads by source</h2>
        {bySource.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No data yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {bySource.map(({ source, count }) => (
              <div key={source} className="flex items-center gap-2">
                <div className="w-24 truncate text-sm">{source}</div>
                <div className="h-4 flex-1 rounded bg-gray-100">
                  <div
                    className="h-4 rounded bg-black"
                    style={{ width: `${(count / maxSourceCount) * 100}%` }}
                  />
                </div>
                <div className="w-8 text-right text-sm">{count}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold">Clients by status</h2>
        <div className="mt-3 grid grid-cols-4 gap-4">
          {clientStatusOrder.map((status) => (
            <div key={status} className="rounded border p-4">
              <div className="text-sm capitalize text-gray-500">{status}</div>
              <div className="text-xl font-semibold">{byStatus[status]}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Activity by teammate</h2>
        {byUser.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No activity yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {byUser.map(({ userId, name, count }) => (
              <div key={userId} className="flex items-center gap-2">
                <div className="w-24 truncate text-sm">{name}</div>
                <div className="h-4 flex-1 rounded bg-gray-100">
                  <div
                    className="h-4 rounded bg-black"
                    style={{ width: `${(count / maxUserCount) * 100}%` }}
                  />
                </div>
                <div className="w-8 text-right text-sm">{count}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
