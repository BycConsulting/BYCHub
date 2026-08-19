import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, status, created_at')
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="text-lg font-semibold">Clients</h1>
      <table className="mt-3 w-full text-left text-sm">
        <thead>
          <tr className="border-b text-gray-500">
            <th className="py-2">Name</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {(clients ?? []).map((client) => (
            <tr key={client.id} className="border-b">
              <td className="py-2">
                <Link href={`/clients/${client.id}`} className="text-blue-600 hover:underline">
                  {client.name}
                </Link>
              </td>
              <td>{client.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
