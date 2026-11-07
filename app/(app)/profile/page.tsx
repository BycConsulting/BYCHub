import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function ProfilePage() {
  const currentUser = await requireUser()

  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('employee_profiles')
    .select(
      'phone, address, emergency_contact_name, emergency_contact_phone, date_of_birth, designation, department, employment_start_date, employment_type'
    )
    .eq('user_id', currentUser.id)
    .single()

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">My profile</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Job info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm text-foreground/75">
            <p>Designation: {profile?.designation ?? '—'}</p>
            <p>Department: {profile?.department ?? '—'}</p>
            <p>Start date: {profile?.employment_start_date ?? '—'}</p>
            <p>Employment type: {profile?.employment_type ?? '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Personal info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm text-foreground/75">
            <p>Phone: {profile?.phone ?? '—'}</p>
            <p>Address: {profile?.address ?? '—'}</p>
            <p>Emergency contact name: {profile?.emergency_contact_name ?? '—'}</p>
            <p>Emergency contact phone: {profile?.emergency_contact_phone ?? '—'}</p>
            <p>Date of birth: {profile?.date_of_birth ?? '—'}</p>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">To update any of this information, contact HR or an admin.</p>
    </div>
  )
}
