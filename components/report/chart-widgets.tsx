'use client'

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { METRIC_CATALOG } from '@/lib/meta/metrics'
import { breakdownPairs, formatMetric, seriesByDay } from '@/lib/meta/shape'
import type { InsightRow } from '@/lib/meta/metrics'

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

export function LineWidget({ rows, metrics }: { rows: InsightRow[]; metrics: string[] }) {
  const data = seriesByDay(rows, metrics)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
        <YAxis tick={{ fontSize: 10 }} width={40} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} formatter={(key: string) => METRIC_CATALOG[key]?.label ?? key} />
        {metrics.map((m, i) => (
          <Line key={m} type="monotone" dataKey={m} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

export function BarWidget({ rows, metric, breakdown }: { rows: InsightRow[]; metric: string; breakdown: string }) {
  const data = breakdownPairs(rows, metric, breakdown)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} width={40} />
        <Tooltip formatter={(v) => formatMetric(metric, Number(v))} />
        <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function DonutWidget({ rows, metric, breakdown }: { rows: InsightRow[]; metric: string; breakdown: string }) {
  const data = breakdownPairs(rows, metric, breakdown)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="85%" isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => formatMetric(metric, Number(v))} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
