import Link from 'next/link'
import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { createConversation } from './actions'
import { chatProviders } from '@/lib/validation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FormSelect } from '@/components/ui/form-select'

const providerLabels: Record<(typeof chatProviders)[number], string> = {
  claude: 'Claude',
  chatgpt: 'ChatGPT',
}

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireUser()
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: conversations } = await supabase
    .from('chat_conversations')
    .select('id, title, provider, created_at')
    .order('created_at', { ascending: false })

  const providerOptions = chatProviders.map((provider) => ({ value: provider, label: providerLabels[provider] }))

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">Chat</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">New conversation</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
          )}
          <form action={createConversation} className="flex items-end gap-2">
            <div className="w-48 space-y-1">
              <label className="text-xs font-medium text-slate-500">Provider</label>
              <FormSelect name="provider" options={providerOptions} defaultValue="claude" />
            </div>
            <Button type="submit">Start chat</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your conversations</CardTitle>
        </CardHeader>
        <CardContent>
          {conversations && conversations.length > 0 ? (
            <div className="space-y-2">
              {conversations.map((conversation) => (
                <Link
                  key={conversation.id}
                  href={`/chat/${conversation.id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
                >
                  <span className="text-sm font-medium text-slate-800">{conversation.title}</span>
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    <Badge variant="secondary">{providerLabels[conversation.provider]}</Badge>
                    {new Date(conversation.created_at).toLocaleDateString()}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No conversations yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
