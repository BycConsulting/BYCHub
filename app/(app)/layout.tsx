import { requireUser, getEnabledModules } from '@/lib/access'
import { getOrCreateAssistantConversation } from '@/lib/assistant-chat'
import { AppShell } from '@/components/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const [enabledModules, assistant] = await Promise.all([
    getEnabledModules(user.role),
    getOrCreateAssistantConversation(user.id),
  ])

  return (
    <AppShell user={user} enabledModules={enabledModules} assistant={assistant}>
      {children}
    </AppShell>
  )
}
