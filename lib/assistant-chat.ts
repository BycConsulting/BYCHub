import type { UIMessage } from 'ai'
import { createClient } from '@/lib/supabase/server'

export const ASSISTANT_CONVERSATION_TITLE = 'BYC Assistant'

export async function getOrCreateAssistantConversation(
  userId: string
): Promise<{ conversationId: string; initialMessages: UIMessage[] } | null> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('chat_conversations')
    .select('id')
    .eq('user_id', userId)
    .eq('title', ASSISTANT_CONVERSATION_TITLE)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  let conversationId = existing?.id

  if (!conversationId) {
    const { data: created, error } = await supabase
      .from('chat_conversations')
      .insert({ user_id: userId, provider: 'claude', title: ASSISTANT_CONVERSATION_TITLE })
      .select('id')
      .single()
    if (error || !created) {
      console.error('[assistant-chat] failed to create conversation', error)
      return null
    }
    conversationId = created.id
  }

  const { data: messageRows } = await supabase
    .from('chat_messages')
    .select('id, role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  const initialMessages: UIMessage[] = (messageRows ?? []).map((row) => ({
    id: row.id,
    role: row.role,
    parts: [{ type: 'text', text: row.content }],
  }))

  return { conversationId, initialMessages }
}
