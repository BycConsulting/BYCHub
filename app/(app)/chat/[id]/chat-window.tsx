'use client'

import { useState, type FormEvent } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import type { ChatProvider } from '@/types/database'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function textFromParts(parts: UIMessage['parts']): string {
  return parts.map((part) => (part.type === 'text' ? part.text : '')).join('')
}

export function ChatWindow({
  conversationId,
  provider,
  initialMessages,
}: {
  conversationId: string
  provider: ChatProvider
  initialMessages: UIMessage[]
}) {
  const [input, setInput] = useState('')

  const { messages, sendMessage, status, error } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  })

  const isBusy = status === 'streaming' || status === 'submitted'

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!input.trim() || isBusy) return
    sendMessage({ text: input }, { body: { provider, conversationId } })
    setInput('')
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === 'user'
                  ? 'ml-auto max-w-lg whitespace-pre-wrap rounded-lg bg-primary p-3 text-sm text-white'
                  : 'mr-auto max-w-lg whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm text-foreground/75'
              }
            >
              {textFromParts(message.parts)}
            </div>
          ))}
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error.message}</p>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Message..."
            className="flex-1"
            disabled={isBusy}
          />
          <Button type="submit" disabled={isBusy}>
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
