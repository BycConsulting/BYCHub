import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { UIMessage } from 'ai'
import { requireUser } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { ChatWindow } from './chat-window'

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireUser()
  const { id } = await params
  const supabase = await createClient()

  const { data: conversation } = await supabase
    .from('chat_conversations')
    .select('id, provider')
    .eq('id', id)
    .single()

  if (!conversation) notFound()

  const { data: messageRows } = await supabase
    .from('chat_messages')
    .select('id, role, content')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  const initialMessages: UIMessage[] = (messageRows ?? []).map((row) => ({
    id: row.id,
    role: row.role,
    parts: [{ type: 'text', text: row.content }],
  }))

  return (
    <div className="space-y-4">
      <Link href="/chat" className="text-sm text-slate-500 hover:underline">
        ← Back to conversations
      </Link>
      <ChatWindow
        key={conversation.id}
        conversationId={conversation.id}
        provider={conversation.provider}
        initialMessages={initialMessages}
      />
    </div>
  )
}
