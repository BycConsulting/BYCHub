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
import { Target, Timer, Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { StatTile } from '@/components/stat-tile'
import { BarList } from '@/components/bar-list'

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

  const statusDot = {
    prospect: 'bg-primary',
    active: 'bg-success',
    paused: 'bg-warning',
    lost: 'bg-destructive',
  } as const

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Sales pipeline and team activity at a glance." />

      {isTruncated && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          Showing partial data — some rows were not loaded. Numbers below may be incomplete or inaccurate.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Total leads" value={leads.length} icon={Target} />
        <StatTile
          label="Win rate"
          value={winRate === null ? '—' : `${winRate.toFixed(0)}%`}
          icon={Trophy}
          tone="success"
        />
        <StatTile
          label="Avg time to won"
          value={avgDays === null ? '—' : `${avgDays.toFixed(1)}d`}
          icon={Timer}
          tone="gold"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads by stage</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={leadStageOrder.map((stage) => ({ label: stage, value: byStage[stage] }))} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads by source</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={bySource.map(({ source, count }) => ({ label: source, value: count }))} />
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold text-foreground">Clients by status</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {clientStatusOrder.map((status) => (
            <div key={status} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm capitalize text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${statusDot[status]}`} />
                {status}
              </div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{byStatus[status]}</div>
            </div>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity by teammate</CardTitle>
        </CardHeader>
        <CardContent>
          <BarList
            rows={byUser.map(({ name, count }) => ({ label: name, value: count }))}
            empty="No activity yet."
          />
        </CardContent>
      </Card>
    </div>
  )
}
