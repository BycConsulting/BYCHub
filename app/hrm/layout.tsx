import { requireUser, getEnabledModules } from '@/lib/access'
import { AppShell } from '@/components/app-shell'

export default async function HrmLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const enabledModules = await getEnabledModules(user.role)

  return (
    <AppShell user={user} enabledModules={enabledModules}>
      {children}
    </AppShell>
  )
}
