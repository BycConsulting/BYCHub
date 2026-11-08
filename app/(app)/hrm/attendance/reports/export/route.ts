import { NextRequest, NextResponse } from 'next/server'
import { requireModule } from '@/lib/access'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { hoursWorked } from '@/lib/attendance'

export async function GET(request: NextRequest) {
  const currentUser = await requireModule('leave_attendance')
  if (currentUser.role !== 'hr' && currentUser.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const { data: records, error: recordsError } = await admin
    .from('attendance_records')
    .select('user_id, date, checked_in_at, checked_out_at')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })

  if (recordsError) {
    return NextResponse.json({ error: recordsError.message }, { status: 500 })
  }

  const userIds = [...new Set((records ?? []).map((r) => r.user_id))]
  const { data: users } =
    userIds.length > 0 ? await admin.from('users').select('id, name').in('id', userIds) : { data: [] }
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]))

  const rows = ['Name,Date,Checked In,Checked Out,Hours']
  for (const record of records ?? []) {
    const hours = record.checked_in_at ? hoursWorked(record.checked_in_at, record.checked_out_at) : null
    // Prefix a leading =/+/-/@ with a tab so spreadsheet apps (Excel,
    // Sheets) don't interpret the cell as a formula — CSV formula
    // injection via a stored, user-editable name field.
    let name = (nameById.get(record.user_id) ?? 'Unknown').replace(/"/g, '""')
    if (/^[=+\-@]/.test(name)) name = `\t${name}`
    rows.push(
      `"${name}",${record.date},${record.checked_in_at ?? ''},${record.checked_out_at ?? ''},${hours ?? ''}`
    )
  }
  const csv = rows.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="attendance-${from}-to-${to}.csv"`,
    },
  })
}
