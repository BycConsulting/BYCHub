'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdminRole } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import {
  createFinanceCategorySchema,
  financeCategoryIdSchema,
  createFinanceTransactionSchema,
  deleteFinanceTransactionSchema,
} from '@/lib/validation'

export async function createCategory(formData: FormData) {
  await requireAdminRole()

  const parsed = createFinanceCategorySchema.safeParse({
    name: formData.get('name'),
    type: formData.get('type'),
  })

  if (!parsed.success) {
    redirect('/finance/categories?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('finance_categories').insert({
    name: parsed.data.name,
    type: parsed.data.type,
  })

  if (error) {
    redirect('/finance/categories?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/finance/categories')
  revalidatePath('/finance')
  redirect('/finance/categories')
}

export async function retireCategory(formData: FormData) {
  await requireAdminRole()

  const parsed = financeCategoryIdSchema.safeParse({ categoryId: formData.get('categoryId') })
  if (!parsed.success) {
    redirect('/finance/categories?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin
    .from('finance_categories')
    .update({ is_active: false })
    .eq('id', parsed.data.categoryId)

  if (error) {
    redirect('/finance/categories?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/finance/categories')
  redirect('/finance/categories')
}

export async function reactivateCategory(formData: FormData) {
  await requireAdminRole()

  const parsed = financeCategoryIdSchema.safeParse({ categoryId: formData.get('categoryId') })
  if (!parsed.success) {
    redirect('/finance/categories?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin
    .from('finance_categories')
    .update({ is_active: true })
    .eq('id', parsed.data.categoryId)

  if (error) {
    redirect('/finance/categories?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/finance/categories')
  redirect('/finance/categories')
}

export async function createTransaction(formData: FormData) {
  const user = await requireAdminRole()

  const parsed = createFinanceTransactionSchema.safeParse({
    type: formData.get('type'),
    categoryId: formData.get('categoryId'),
    amount: formData.get('amount'),
    currency: formData.get('currency'),
    transactionDate: formData.get('transactionDate'),
    clientId: formData.get('clientId'),
    note: formData.get('note'),
  })

  if (!parsed.success) {
    redirect('/finance?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const { type, categoryId, amount, currency, transactionDate, clientId, note } = parsed.data
  const admin = createAdminSupabaseClient()

  const { data: category, error: categoryError } = await admin
    .from('finance_categories')
    .select('type')
    .eq('id', categoryId)
    .single()

  if (categoryError || !category) {
    redirect('/finance?error=' + encodeURIComponent('Category not found'))
  }

  if (category.type !== type) {
    redirect(
      '/finance?error=' +
        encodeURIComponent(`That category is for ${category.type} transactions, not ${type}`)
    )
  }

  let receiptPath: string | null = null
  const receipt = formData.get('receipt')

  if (receipt instanceof File && receipt.size > 0) {
    const path = `${crypto.randomUUID()}-${receipt.name}`
    const { error: uploadError } = await admin.storage
      .from('finance-receipts')
      .upload(path, receipt, { contentType: receipt.type || 'application/octet-stream' })

    if (uploadError) {
      redirect('/finance?error=' + encodeURIComponent('Receipt upload failed: ' + uploadError.message))
    }

    receiptPath = path
  }

  const { error: insertError } = await admin.from('finance_transactions').insert({
    type,
    category_id: categoryId,
    amount,
    currency: currency || 'INR',
    transaction_date: transactionDate || undefined,
    client_id: type === 'income' && clientId ? clientId : null,
    note: note || null,
    receipt_path: receiptPath,
    created_by: user.id,
  })

  if (insertError) {
    redirect('/finance?error=' + encodeURIComponent(insertError.message))
  }

  revalidatePath('/finance')
  redirect('/finance')
}

export async function deleteTransaction(formData: FormData) {
  await requireAdminRole()

  const parsed = deleteFinanceTransactionSchema.safeParse({
    transactionId: formData.get('transactionId'),
  })

  if (!parsed.success) {
    redirect('/finance?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('finance_transactions').delete().eq('id', parsed.data.transactionId)

  if (error) {
    redirect('/finance?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/finance')
  redirect('/finance')
}
