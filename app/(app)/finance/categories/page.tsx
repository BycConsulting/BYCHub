import Link from 'next/link'
import { requireAdminRole } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createCategory, retireCategory, reactivateCategory } from '../actions'
import { financeTransactionTypes } from '@/lib/validation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/ui/form-select'

export default async function FinanceCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireAdminRole()
  const { error } = await searchParams
  const supabase = await createAdminSupabaseClient()

  const { data: categories } = await supabase
    .from('finance_categories')
    .select('id, name, type, is_active')
    .order('type')
    .order('name')

  const typeOptions = financeTransactionTypes.map((type) => ({ value: type, label: type }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Finance categories</h1>
        <Link href="/finance" className="text-sm text-slate-500 hover:underline">
          Back to ledger
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add category</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
          )}
          <form action={createCategory} className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-slate-500">Name</label>
              <Input name="name" placeholder="Category name" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">Type</label>
              <FormSelect name="type" options={typeOptions} defaultValue="expense" />
            </div>
            <Button type="submit">Add</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(categories ?? []).map((category) => (
              <TableRow key={category.id}>
                <TableCell className="font-medium text-slate-800">{category.name}</TableCell>
                <TableCell className="capitalize">{category.type}</TableCell>
                <TableCell>
                  <Badge variant={category.is_active ? 'default' : 'secondary'}>
                    {category.is_active ? 'Active' : 'Retired'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {category.is_active ? (
                    <form action={retireCategory}>
                      <input type="hidden" name="categoryId" value={category.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Retire
                      </Button>
                    </form>
                  ) : (
                    <form action={reactivateCategory}>
                      <input type="hidden" name="categoryId" value={category.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Reactivate
                      </Button>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
