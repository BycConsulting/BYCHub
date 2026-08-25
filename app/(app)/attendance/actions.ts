'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { isIpAllowed, isIpv4Address, parseClientIp, todayDate } from '@/lib/attendance'

async function resolveClientIp(): Promise<string | null> {
  const headerList = await headers()
  const realIp = headerList.get('x-real-ip')
  if (realIp && realIp.trim().length > 0) return realIp.trim()
  return parseClientIp(headerList.get('x-forwarded-for'))
}

interface GateResult {
  open: boolean
  configUnavailable: boolean
}

// The IP gate and the WFH bypass are both re-evaluated here on every call —
// never cached, never trusted from the client — per the design spec.
async function isGateOpen(userId: string, ip: string | null): Promise<GateResult> {
  const admin = createAdminSupabaseClient()
  const { data: config, error: configError } = await admin.from('hr_config').select('office_ip_allowlist').eq('id', true).single()
  if (configError) {
    console.error('isGateOpen: failed to read hr_config.office_ip_allowlist:', configError.message)
  }
  const allowlist = config?.office_ip_allowlist ?? ''

  if (ip && isIpAllowed(ip, allowlist)) {
    return { open: true, configUnavailable: false }
  }

  // WFH lookup queries the caller's own leave_requests rows, already
  // covered by that table's existing SELECT-own policy, so it uses the
  // regular authenticated client — no service-role needed here.
  const supabase = await createClient()
  const today = todayDate()
  const { data: wfh, error: wfhError } = await supabase
    .from('leave_requests')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'wfh')
    .eq('status', 'approved')
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1)
  if (wfhError) {
    console.error('isGateOpen: failed to check WFH bypass:', wfhError.message)
  }

  return { open: (wfh ?? []).length > 0, configUnavailable: Boolean(configError) }
}

function gateErrorMessage(gate: GateResult, ip: string | null): string {
  if (gate.configUnavailable) return 'Could not verify your network — contact HR'
  if (ip && !isIpv4Address(ip)) return 'Your network uses IPv6, which is not yet supported — contact HR'
  return 'Not on the office network'
}

export async function checkIn() {
  const currentUser = await requireUser()
  const supabase = await createClient()
  const ip = await resolveClientIp()
  const today = todayDate()

  const { data: existing } = await supabase
    .from('attendance_records')
    .select('id, checked_in_at')
    .eq('user_id', currentUser.id)
    .eq('date', today)
    .single()

  if (existing?.checked_in_at) {
    redirect('/attendance?error=' + encodeURIComponent('Already checked in today'))
  }

  const gate = await isGateOpen(currentUser.id, ip)
  if (!gate.open) {
    redirect('/attendance?error=' + encodeURIComponent(gateErrorMessage(gate, ip)))
  }

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('attendance_records').insert({
    user_id: currentUser.id,
    date: today,
    checked_in_at: new Date().toISOString(),
    checked_in_ip: ip,
  })

  if (error) {
    redirect('/attendance?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/attendance')
  redirect('/attendance')
}

export async function checkOut() {
  const currentUser = await requireUser()
  const ip = await resolveClientIp()
  const today = todayDate()
  const admin = createAdminSupabaseClient()

  const { data: record } = await admin
    .from('attendance_records')
    .select('id, checked_in_at, checked_out_at')
    .eq('user_id', currentUser.id)
    .eq('date', today)
    .single()

  if (!record || !record.checked_in_at || record.checked_out_at) {
    redirect('/attendance?error=' + encodeURIComponent('Not checked in today, or already checked out'))
  }

  const gate = await isGateOpen(currentUser.id, ip)
  if (!gate.open) {
    redirect('/attendance?error=' + encodeURIComponent(gateErrorMessage(gate, ip)))
  }

  // Re-check `checked_out_at is null` in the update's own filter (not just
  // the fetch above), and confirm via `.select().single()` that the update
  // actually matched a row — same race-safety and silent-no-op guard used
  // everywhere else in this app (e.g. cancelLeaveRequest in
  // app/(app)/leave/actions.ts).
  const { data: updated, error } = await admin
    .from('attendance_records')
    .update({ checked_out_at: new Date().toISOString(), checked_out_ip: ip })
    .eq('id', record.id)
    .eq('user_id', currentUser.id)
    .is('checked_out_at', null)
    .select('id')
    .single()

  if (!updated) {
    const message = !error || error.code === 'PGRST116' ? 'Already checked out' : error.message
    redirect('/attendance?error=' + encodeURIComponent(message))
  }

  revalidatePath('/attendance')
  redirect('/attendance')
}
