/** Horizontal rounded bars scaled to the largest value; server-renderable, no chart library. */
export function BarList({
  rows,
  empty = 'No data yet.',
}: {
  rows: { label: string; value: number }[]
  empty?: string
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  const max = Math.max(1, ...rows.map((row) => row.value))

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <div className="w-28 truncate text-sm capitalize text-foreground/75">{row.label}</div>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-gold"
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
          <div className="w-8 text-right text-sm font-medium tabular-nums text-foreground">{row.value}</div>
        </div>
      ))}
    </div>
  )
}
