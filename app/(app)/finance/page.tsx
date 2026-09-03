import Link from 'next/link'
import { requireAdminRole } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createTransaction, deleteTransaction } from './actions'
import { financeTransactionTypes } from '@/lib/validation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/ui/form-select'

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; type?: string; categoryId?: string; from?: string; to?: string }>
}) {
  await requireAdminRole()
  const { error, type, categoryId, from, to } = await searchParams
  const admin = createAdminSupabaseClient()

  const { data: categories } = await admin
    .from('finance_categories')
    .select('id, name, type, is_active')
    .order('type')
    .order('name')

  const { data: clients } = await admin.from('clients').select('id, name').order('name')

  let query = admin
    .from('finance_transactions')
    .select('id, type, category_id, amount, currency, transaction_date, client_id, note, receipt_path')
    .order('transaction_date', { ascending: false })

  if (type) query = query.eq('type', type as typeof financeTransactionTypes[number])
  if (categoryId) query = query.eq('category_id', categoryId)
  if (from) query = query.gte('transaction_date', from)
  if (to) query = query.lte('transaction_date', to)

  const { data: transactions, error: transactionsError } = await query
  if (transactionsError) {
    console.error('[finance] failed to load transactions', transactionsError)
  }

  const allTransactions = transactions ?? []
  const allCategories = categories ?? []
  const categoryNames = Object.fromEntries(allCategories.map((c) => [c.id, c.name]))
  const clientNames = Object.fromEntries((clients ?? []).map((c) => [c.id, c.name]))

  const totalsByCurrency = allTransactions.reduce<Record<string, { income: number; expense: number }>>(
    (totals, transaction) => {
      const bucket = totals[transaction.currency] ?? { income: 0, expense: 0 }
      bucket[transaction.type] += transaction.amount
      totals[transaction.currency] = bucket
      return totals
    },
    {}
  )

  const receiptUrls = Object.fromEntries(
    await Promise.all(
      allTransactions
        .filter((t) => t.receipt_path)
        .map(async (t) => {
          const { data } = await admin.storage.from('finance-receipts').createSignedUrl(t.receipt_path!, 300)
          return [t.id, data?.signedUrl ?? null] as const
        })
    )
  )

  const typeFilterOptions = [{ value: '', label: 'All types' }, ...financeTransactionTypes.map((t) => ({ value: t, label: t }))]
  const categoryFilterOptions = [
    { value: '', label: 'All categories' },
    ...allCategories.map((c) => ({ value: c.id, label: `${c.name} (${c.type})` })),
  ]
  const typeOptions = financeTransactionTypes.map((t) => ({ value: t, label: t }))
  const categoryOptions = allCategories
    .filter((c) => c.is_active)
    .map((c) => ({ value: c.id, label: `${c.name} (${c.type})` }))
  const clientOptions = [{ value: '', label: 'No client' }, ...(clients ?? []).map((c) => ({ value: c.id, label: c.name }))]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Finance</h1>
        <Link href="/finance/categories" className="text-sm text-slate-500 hover:underline">
          Manage categories
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">P&amp;L by currency</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(totalsByCurrency).length === 0 ? (
            <p className="text-sm text-slate-500">No transactions yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(totalsByCurrency).map(([currency, totals]) => (
                <div key={currency} className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-medium text-slate-500">{currency}</div>
                  <div className="mt-1 text-sm text-slate-700">Income: {totals.income.toFixed(2)}</div>
                  <div className="text-sm text-slate-700">Expense: {totals.expense.toFixed(2)}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">
                    Net: {(totals.income - totals.expense).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add transaction</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
          )}
          <form action={createTransaction} encType="multipart/form-data" className="grid grid-cols-4 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Type</label>
              <FormSelect name="type" options={typeOptions} defaultValue="expense" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Category</label>
              <FormSelect name="categoryId" options={categoryOptions} defaultValue={categoryOptions[0]?.value ?? ''} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Amount</label>
              <Input name="amount" type="number" step="0.01" min="0.01" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Currency</label>
              <Input name="currency" placeholder="INR" defaultValue="INR" maxLength={3} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Date</label>
              <Input name="transactionDate" type="date" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Client (income only)</label>
              <FormSelect name="clientId" options={clientOptions} defaultValue="" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium text-slate-500">Note</label>
              <Input name="note" placeholder="Optional note" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Receipt</label>
              <input
                name="receipt"
                type="file"
                className="block w-full text-sm text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-sm"
              />
            </div>
            <Button type="submit" className="col-span-4">
              Add transaction
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <form className="flex items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Type</label>
              <FormSelect name="type" options={typeFilterOptions} defaultValue={type ?? ''} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Category</label>
              <FormSelect name="categoryId" options={categoryFilterOptions} defaultValue={categoryId ?? ''} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">From</label>
              <Input name="from" type="date" defaultValue={from ?? ''} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">To</label>
              <Input name="to" type="date" defaultValue={to ?? ''} />
            </div>
            <Button type="submit" variant="outline">
              Filter
            </Button>
          </form>
        </CardContent>
      </Card>

      {transactionsError && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          Failed to load transactions: {transactionsError.message}
        </p>
      )}

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Receipt</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allTransactions.map((transaction) => (
              <TableRow key={transaction.id}>
                <TableCell>{transaction.transaction_date}</TableCell>
                <TableCell>
                  <Badge variant={transaction.type === 'income' ? 'default' : 'secondary'} className="capitalize">
                    {transaction.type}
                  </Badge>
                </TableCell>
                <TableCell>{categoryNames[transaction.category_id] ?? '—'}</TableCell>
                <TableCell>
                  {transaction.amount.toFixed(2)} {transaction.currency}
                </TableCell>
                <TableCell>{transaction.client_id ? clientNames[transaction.client_id] ?? '—' : '—'}</TableCell>
                <TableCell className="max-w-xs truncate">{transaction.note ?? '—'}</TableCell>
                <TableCell>
                  {receiptUrls[transaction.id] ? (
                    <a
                      href={receiptUrls[transaction.id]!}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-600 hover:underline"
                    >
                      View
                    </a>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell>
                  <form action={deleteTransaction}>
                    <input type="hidden" name="transactionId" value={transaction.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Delete
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
