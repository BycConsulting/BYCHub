import { requireUser, getEnabledModules } from '@/lib/access'
import { getOrCreateAssistantConversation } from '@/lib/assistant-chat'
import { getUnreadCount } from '@/lib/notifications-read'
import { AppShell } from '@/components/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const [enabledModules, assistant, unreadCount] = await Promise.all([
    getEnabledModules(user.role),
    getOrCreateAssistantConversation(user.id),
    getUnreadCount(),
  ])

  return (
    <AppShell user={user} enabledModules={enabledModules} assistant={assistant} unreadCount={unreadCount}>
      {children}
    </AppShell>
  )
}
