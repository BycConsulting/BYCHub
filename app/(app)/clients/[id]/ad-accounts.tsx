import { addAdAccount, removeAdAccount } from './ad-accounts-actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export function AdAccounts({
  clientId,
  accounts,
}: {
  clientId: string
  accounts: { id: string; ad_account_id: string; label: string }[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Meta ad accounts</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center justify-between rounded-lg border border-border p-2 text-sm"
            >
              <span>
                <span className="font-medium text-foreground">{account.ad_account_id}</span>
                {account.label && <span className="text-muted-foreground"> — {account.label}</span>}
              </span>
              <form action={removeAdAccount}>
                <input type="hidden" name="id" value={account.id} />
                <input type="hidden" name="clientId" value={clientId} />
                <button type="submit" className="text-destructive underline">
                  Remove
                </button>
              </form>
            </li>
          ))}
          {accounts.length === 0 && (
            <li className="text-sm text-muted-foreground">No ad account mapped yet. Add one to build Meta reports.</li>
          )}
        </ul>

        <form action={addAdAccount} className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input type="hidden" name="clientId" value={clientId} />
          <Input name="adAccountId" placeholder="act_1234567890" required />
          <Input name="label" placeholder="Label (optional)" />
          <Button type="submit" variant="outline">
            Add ad account
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
