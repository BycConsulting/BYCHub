import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireModule } from '@/lib/access'

export default async function ClientsPage() {
  await requireModule('clients')
  const supabase = await createClient()
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, status, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-800">Clients</h1>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="px-4 py-2">Name</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(clients ?? []).map((client) => (
              <tr key={client.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/clients/${client.id}`} className="font-medium text-slate-800 hover:underline">
                    {client.name}
                  </Link>
                </td>
                <td className="text-slate-600">{client.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
