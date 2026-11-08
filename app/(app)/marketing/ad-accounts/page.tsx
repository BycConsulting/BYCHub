import { requireModule } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { addAdAccount, removeAdAccount } from './actions'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormSelect } from '@/components/ui/form-select'
import { Input } from '@/components/ui/input'

export default async function AdAccountsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireModule('clients')
  const { error } = await searchParams
  const supabase = await createClient()

  const [{ data: clients }, { data: accounts }] = await Promise.all([
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('client_ad_accounts').select('id, client_id, ad_account_id, label').order('created_at'),
  ])

  const clientOptions = (clients ?? []).map((c) => ({ value: c.id, label: c.name }))

  return (
    <div className="space-y-6">
      <PageHeader title="Ad accounts" description="Map each client to their Meta ad account IDs (act_…). Reports read from these accounts." />

      {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add ad account</CardTitle>
        </CardHeader>
        <CardContent>
          {clientOptions.length > 0 ? (
            <form action={addAdAccount} className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <FormSelect name="clientId" options={clientOptions} defaultValue={clientOptions[0].value} />
              <Input name="adAccountId" placeholder="act_1234567890" required />
              <Input name="label" placeholder="Label (optional)" />
              <Button type="submit">Add ad account</Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Add a client first (Sales → Clients).</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(clients ?? []).map((client) => {
          const mine = (accounts ?? []).filter((a) => a.client_id === client.id)
          return (
            <Card key={client.id}>
              <CardHeader>
                <CardTitle className="text-base">{client.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {mine.map((account) => (
                    <li key={account.id} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
                      <span>
                        <span className="font-medium text-foreground">{account.ad_account_id}</span>
                        {account.label && <span className="text-muted-foreground"> — {account.label}</span>}
                      </span>
                      <form action={removeAdAccount}>
                        <input type="hidden" name="id" value={account.id} />
                        <input type="hidden" name="clientId" value={client.id} />
                        <button type="submit" className="text-destructive underline">
                          Remove
                        </button>
                      </form>
                    </li>
                  ))}
                  {mine.length === 0 && <li className="text-sm text-muted-foreground">No ad account mapped.</li>}
                </ul>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
