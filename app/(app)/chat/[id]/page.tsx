import { notFound } from 'next/navigation'
import type { UIMessage } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { ChatWindow } from './chat-window'

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
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
    <ChatWindow conversationId={conversation.id} provider={conversation.provider} initialMessages={initialMessages} />
  )
}
