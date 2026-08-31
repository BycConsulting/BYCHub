import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { ConfirmSubmitButton } from '@/app/(app)/confirm-submit-button'
import { updateOffboardingChecklist, completeOffboarding } from '../actions'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

const STEPS = [
  { key: 'stepResignationRecorded', column: 'step_resignation_recorded', label: 'Resignation/termination recorded' },
  { key: 'stepExitInterviewDone', column: 'step_exit_interview_done', label: 'Exit interview done' },
  { key: 'stepAssetsReturned', column: 'step_assets_returned', label: 'Assets returned' },
  {
    key: 'stepAccountsDeprovisioned',
    column: 'step_accounts_deprovisioned',
    label: 'System accounts deprovisioned',
  },
  { key: 'stepFinalSettlementDone', column: 'step_final_settlement_done', label: 'Final settlement done' },
] as const

export default async function OffboardingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await requireModule('offboarding')
  const { id } = await params
  const { error } = await searchParams

  const admin = createAdminSupabaseClient()

  const { data: checklist, error: checklistError } = await admin
    .from('offboarding_checklists')
    .select('*')
    .eq('id', id)
    .single()

  if (checklistError && checklistError.code !== 'PGRST116') {
    throw new Error(`Could not load offboarding checklist: ${checklistError.message}`)
  }

  if (!checklist) notFound()

  const { data: employee } = await admin.from('users').select('id, name').eq('id', checklist.user_id).single()

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/hrm/offboarding" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
        ← Back to Offboarding
      </Link>
      <h1 className="text-xl font-semibold text-slate-800">{employee?.name ?? 'Unknown'}</h1>
      <p className="text-sm text-slate-500">
        Started {checklist.started_at.slice(0, 10)}
        {checklist.completed_at && <> · Completed {checklist.completed_at.slice(0, 10)}</>}
      </p>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      <Card>
        <CardContent>
          <form action={updateOffboardingChecklist} className="space-y-4">
            <input type="hidden" name="checklistId" value={checklist.id} />
            <div className="space-y-2">
              {STEPS.map((step) => (
                <label key={step.key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name={step.key}
                    defaultChecked={checklist[step.column]}
                    className="accent-slate-800"
                  />
                  {step.label}
                </label>
              ))}
            </div>
            <label className="block text-sm text-slate-700">
              Notes
              <Textarea name="notes" defaultValue={checklist.notes} rows={3} className="mt-1 w-full" />
            </label>
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>

      {!checklist.completed_at && (
        <form action={completeOffboarding}>
          <input type="hidden" name="checklistId" value={checklist.id} />
          <ConfirmSubmitButton
            confirmMessage="Mark offboarding complete? This cannot be undone."
            className={buttonVariants({ variant: 'outline' })}
          >
            Mark complete
          </ConfirmSubmitButton>
        </form>
      )}
    </div>
  )
}
