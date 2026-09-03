'use client'

import { useState, type FormEvent } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { MessageCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const ASSISTANT_SYSTEM_PROMPT =
  'You are BYC Assistant, a helpful internal assistant for BYC Hub employees. Keep answers concise. ' +
  'You do not have access to live company data — if asked about specific records, tell the employee to check the relevant BYC Hub page.'

function textFromParts(parts: UIMessage['parts']): string {
  return parts.map((part) => (part.type === 'text' ? part.text : '')).join('')
}

export function GlobalChatBubble({
  conversationId,
  initialMessages,
}: {
  conversationId: string
  initialMessages: UIMessage[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')

  const { messages, sendMessage, status, error } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!input.trim()) return
    sendMessage({ text: input }, { body: { provider: 'claude', conversationId, system: ASSISTANT_SYSTEM_PROMPT } })
    setInput('')
  }

  const isBusy = status === 'streaming' || status === 'submitted'

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close BYC Assistant' : 'Open BYC Assistant'}
        className="fixed right-6 bottom-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-white shadow-lg transition hover:bg-slate-700"
      >
        {isOpen ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      <div
        className={cn(
          'fixed right-6 bottom-20 z-50 flex h-[32rem] w-96 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-xl bg-card text-card-foreground shadow-2xl ring-1 ring-foreground/10 transition',
          isOpen ? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
        )}
        role="dialog"
        aria-label="BYC Assistant"
        aria-hidden={!isOpen}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold text-slate-800">BYC Assistant</span>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.length === 0 && <p className="text-sm text-slate-400">Ask BYC Assistant anything.</p>}
          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === 'user'
                  ? 'ml-auto max-w-[85%] rounded-lg bg-slate-800 p-2.5 text-sm whitespace-pre-wrap text-white'
                  : 'mr-auto max-w-[85%] rounded-lg bg-slate-100 p-2.5 text-sm whitespace-pre-wrap text-slate-700'
              }
            >
              {textFromParts(message.parts)}
            </div>
          ))}
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error.message}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-slate-200 p-3">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Message BYC Assistant..."
            className="flex-1"
            disabled={isBusy}
          />
          <Button type="submit" size="icon" disabled={isBusy}>
            <MessageCircle className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </>
  )
}
