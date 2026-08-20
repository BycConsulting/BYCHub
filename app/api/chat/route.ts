import { streamText, convertToModelMessages, type UIMessage } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { createClient } from '@/lib/supabase/server'
import { chatProviders } from '@/lib/validation'
import type { ChatProvider } from '@/types/database'

function textFromParts(parts: UIMessage['parts']): string {
  return parts.map((part) => (part.type === 'text' ? part.text : '')).join('')
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    messages?: UIMessage[]
    provider?: ChatProvider
    conversationId?: string
  }

  const { messages, provider, conversationId } = body

  if (!messages || !provider || !conversationId || !chatProviders.includes(provider)) {
    return new Response(JSON.stringify({ error: 'Malformed request' }), { status: 400 })
  }

  if (provider === 'claude' && !process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Claude isn't configured — ask an admin to add ANTHROPIC_API_KEY." }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
  if (provider === 'chatgpt' && !process.env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ChatGPT isn't configured — ask an admin to add OPENAI_API_KEY." }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 })
  }

  const { data: conversation, error: conversationError } = await supabase
    .from('chat_conversations')
    .select('id')
    .eq('id', conversationId)
    .single()

  if (conversationError || !conversation) {
    return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 })
  }

  const model = provider === 'claude' ? anthropic('claude-sonnet-5') : openai('gpt-5.4')

  const lastUserMessage = messages[messages.length - 1]
  const lastUserText = textFromParts(lastUserMessage.parts)

  await supabase.from('chat_messages').insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: 'user',
    content: lastUserText,
  })

  const result = streamText({
    model,
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onEnd: async ({ responseMessage }) => {
      const assistantText = textFromParts(responseMessage.parts)

      await supabase.from('chat_messages').insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: 'assistant',
        content: assistantText,
      })

      await supabase
        .from('chat_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId)
    },
  })
}
