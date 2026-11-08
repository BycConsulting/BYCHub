import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function ClientMetricsPage() {
  await requireModule('clients')
  const supabase = await createClient()
  const { data: clients } = await supabase.from('clients').select('id, name, status').order('name')

  return (
    <div className="space-y-6">
      <PageHeader title="Client metrics" description="Monthly marketing metrics logged per client, with trend dashboards." />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Log metrics</TableHead>
              <TableHead>Dashboard</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(clients ?? []).map((client) => (
              <TableRow key={client.id}>
                <TableCell className="font-medium text-foreground">{client.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">
                    {client.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Link href={`/clients/${client.id}`} className="text-primary hover:underline">
                    Open client
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/clients/${client.id}/dashboard`} className="text-primary hover:underline">
                    View dashboard
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {(clients ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  No clients yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
