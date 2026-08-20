'use client'

import { useState, type FormEvent } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import type { ChatProvider } from '@/types/database'

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

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!input.trim()) return
    sendMessage({ text: input }, { body: { provider, conversationId } })
    setInput('')
  }

  const isBusy = status === 'streaming' || status === 'submitted'

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === 'user'
                ? 'ml-auto max-w-lg rounded bg-black p-3 text-sm text-white'
                : 'mr-auto max-w-lg rounded bg-gray-100 p-3 text-sm'
            }
          >
            {textFromParts(message.parts)}
          </div>
        ))}
      </div>

      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error.message}</p>}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Message..."
          className="flex-1 rounded border px-3 py-2"
        />
        <button
          type="submit"
          disabled={isBusy}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}
