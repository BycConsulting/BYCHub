import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireModule } from '@/lib/access'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'active') return 'default'
  if (status === 'lost') return 'destructive'
  return 'secondary'
}

export default async function ClientsPage() {
  await requireModule('clients')
  const supabase = await createClient()
  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select('id, name, status, created_at')
    .order('created_at', { ascending: false })

  if (clientsError) {
    console.error('[clients] failed to load clients list', clientsError)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-800">Clients</h1>
      {clientsError && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          Failed to load clients: {clientsError.message}
        </p>
      )}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(clients ?? []).map((client) => (
              <TableRow key={client.id}>
                <TableCell>
                  <Link href={`/clients/${client.id}`} className="font-medium text-slate-800 hover:underline">
                    {client.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(client.status)} className="capitalize">
                    {client.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
