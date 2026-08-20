# Multi-Model Chatbot Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give employees a `/chat` area where they pick Claude or ChatGPT, have a streaming conversation, and see their own past conversations — private per employee, one shared company API key per provider.

**Architecture:** A new Route Handler (`app/api/chat/route.ts`) calls the Vercel AI SDK's `streamText()` with the Anthropic or OpenAI adapter and streams the response back; a Client Component (the app's first) drives the streaming UI via the SDK's `useChat` hook. Conversations and messages persist to two new Supabase tables, private per employee via RLS.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Supabase, Tailwind CSS, Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/react`).

**Spec:** [docs/superpowers/specs/2026-08-20-multi-model-chatbot-router-design.md](../specs/2026-08-20-multi-model-chatbot-router-design.md)

## Global Constraints

- Manual provider selection only — no automatic routing based on credit/budget.
- One shared company API key per provider (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`), not per-employee keys.
- Streaming responses, via the Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/react`) — chosen specifically to avoid hand-rolling two different providers' SSE stream formats.
- Conversation history is private per employee: RLS on both new tables uses direct `auth.uid() = user_id` checks (no `EXISTS`/subquery pattern), and no admin oversight of other employees' chats exists in this sub-project.
- Claude model: `claude-sonnet-5`. ChatGPT model: `gpt-5.4` (both pinned here, per the spec's instruction that exact model IDs are a plan-writing-time decision).
- Missing API key must return a clear inline error, not a crash or hang.
- Testing: manual QA in the dev server (platform-wide decision, no automated test suite).
- These package versions are what's currently on npm and were verified directly (installed to a scratch directory and their type declarations read) while writing this plan — pin them exactly rather than using `"latest"` (a `"latest"` pin caused a real type-drift bug in an earlier sub-project): `ai@^7.0.70`, `@ai-sdk/anthropic@^4.0.40`, `@ai-sdk/openai@^4.0.44`, `@ai-sdk/react@^4.0.73`.

---

### Task 1: Database schema (MANUAL — human step)

This task requires running SQL against the live Supabase project, which the agent has no
programmatic access to (confirmed in an earlier sub-project: no SQL-exec RPC, no
Management API token, no direct Postgres connection string available). A human runs this
step; the agent's job is to produce the exact SQL and commit it as a migration file.

**Files:**
- Create: `supabase/migrations/0003_chat.sql`

**Interfaces:**
- Produces: `chat_conversations` and `chat_messages` tables with private-per-employee RLS
  that Tasks 2-5 depend on.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0003_chat.sql`:

```sql
create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  title text not null default 'New conversation',
  provider text not null check (provider in ('claude', 'chatgpt')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.users(id),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

-- Private per employee: unlike the CRM tables (any employee reads/writes any row),
-- chats are only visible to the employee who created them. Direct auth.uid() = user_id
-- checks on both tables, no EXISTS/subquery, avoiding the join-based-RLS pattern.
create policy "chat_conversations_own" on public.chat_conversations
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "chat_messages_own" on public.chat_messages
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- [ ] **Step 2: Human runs the migration**

Hand these instructions to the user:

1. Go to the Supabase dashboard for the `yvnfiihppvderdjhzdyy` project.
2. SQL Editor → paste the contents of `supabase/migrations/0003_chat.sql` → Run.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/0003_chat.sql
git commit -m "feat: add chat_conversations and chat_messages tables"
```

---

### Task 2: Types and validation schemas

**Files:**
- Modify: `types/database.ts`
- Modify: `lib/validation.ts`

**Interfaces:**
- Produces:
  - `ChatProvider` (`'claude' | 'chatgpt'`) and `ChatMessageRole` (`'user' | 'assistant'`)
    types from `@/types/database`, plus `chat_conversations`/`chat_messages` entries in the
    `Database` interface's `Tables`.
  - `chatProviders` (const array) and `createConversationSchema` (zod) from
    `@/lib/validation`.

- [ ] **Step 1: Add the chat types to `types/database.ts`**

Add these two type exports right after the existing `ActivityType` export (after line 4):

```ts
export type ChatProvider = 'claude' | 'chatgpt'
export type ChatMessageRole = 'user' | 'assistant'
```

Add these two table entries inside `Database['public']['Tables']`, after the existing
`activities` entry (the file currently closes `Tables: { ... }` right after `activities`
— add these as two more sibling entries before that closing brace):

```ts
      chat_conversations: {
        Row: {
          id: string
          user_id: string
          title: string
          provider: ChatProvider
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          title?: string
          provider: ChatProvider
        }
        Update: {
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          id: string
          conversation_id: string
          user_id: string
          role: ChatMessageRole
          content: string
          created_at: string
        }
        Insert: {
          conversation_id: string
          user_id: string
          role: ChatMessageRole
          content: string
        }
        Update: never
        Relationships: []
      }
```

The full file (for reference — this is what it should look like after your edit; the
`users`/`clients`/`leads`/`activities` entries and the `Views`/`Functions` lines are
unchanged from what's already there):

```ts
export type UserRole = 'admin' | 'employee'
export type ClientStatus = 'prospect' | 'active' | 'paused' | 'lost'
export type LeadStage = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost'
export type ActivityType = 'note' | 'call' | 'email' | 'stage_change'
export type ChatProvider = 'claude' | 'chatgpt'
export type ChatMessageRole = 'user' | 'assistant'

export interface Database {
  public: {
    Tables: {
      users: {
        Row: { id: string; email: string; name: string; role: UserRole; created_at: string }
        Insert: { id: string; email: string; name: string; role?: UserRole }
        Update: { name?: string; role?: UserRole }
        Relationships: []
      }
      clients: {
        Row: { id: string; name: string; status: ClientStatus; owner_user_id: string | null; created_at: string }
        Insert: { name: string; status?: ClientStatus; owner_user_id?: string | null }
        Update: { name?: string; status?: ClientStatus; owner_user_id?: string | null }
        Relationships: []
      }
      leads: {
        Row: {
          id: string
          client_id: string | null
          source: string | null
          contact_name: string
          contact_email: string | null
          contact_company: string | null
          stage: LeadStage
          fit_score: number | null
          assigned_user_id: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          source?: string | null
          contact_name: string
          contact_email?: string | null
          contact_company?: string | null
          stage?: LeadStage
          fit_score?: number | null
          assigned_user_id?: string | null
          notes?: string | null
        }
        Update: Partial<{
          client_id: string | null
          stage: LeadStage
          fit_score: number | null
          assigned_user_id: string | null
          notes: string | null
          updated_at: string
        }>
        Relationships: []
      }
      activities: {
        Row: {
          id: string
          lead_id: string | null
          client_id: string | null
          user_id: string
          type: ActivityType
          body: string | null
          created_at: string
        }
        Insert: {
          lead_id?: string | null
          client_id?: string | null
          user_id: string
          type: ActivityType
          body?: string | null
        }
        Update: never
        Relationships: []
      }
      chat_conversations: {
        Row: {
          id: string
          user_id: string
          title: string
          provider: ChatProvider
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          title?: string
          provider: ChatProvider
        }
        Update: {
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          id: string
          conversation_id: string
          user_id: string
          role: ChatMessageRole
          content: string
          created_at: string
        }
        Insert: {
          conversation_id: string
          user_id: string
          role: ChatMessageRole
          content: string
        }
        Update: never
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
```

- [ ] **Step 2: Add the validation schema to `lib/validation.ts`**

Add at the end of the file:

```ts
export const chatProviders = ['claude', 'chatgpt'] as const

export const createConversationSchema = z.object({
  provider: z.enum(chatProviders),
})
```

- [ ] **Step 3: Verify the build**

```bash
npm run build
```

Expected: succeeds (these types/schemas aren't wired into any page yet, but must
type-check standalone).

- [ ] **Step 4: Commit**

```bash
git add types/database.ts lib/validation.ts
git commit -m "feat: add chat types and validation schema"
```

---

### Task 3: AI SDK dependencies + streaming Route Handler

**Files:**
- Create: `app/api/chat/route.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`; `ChatProvider` from
  `@/types/database`.
- Produces: a `POST` handler at `/api/chat` that Task 5's Client Component calls. Request
  body shape: `{ messages: UIMessage[]; provider: ChatProvider; conversationId: string }`.

- [ ] **Step 1: Install the AI SDK dependencies**

```bash
npm install ai@^7.0.70 @ai-sdk/anthropic@^4.0.40 @ai-sdk/openai@^4.0.44 @ai-sdk/react@^4.0.73
```

- [ ] **Step 2: Write the Route Handler**

Create `app/api/chat/route.ts`:

```ts
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
    messages: convertToModelMessages(messages),
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
```

- [ ] **Step 3: Verify the build**

```bash
npm run build
```

Expected: succeeds with no type errors. This route isn't called by any UI yet (Task 5
adds the caller) — verifying the build is the acceptance bar for this task.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json "app/api/chat/route.ts"
git commit -m "feat: add streaming chat Route Handler"
```

---

### Task 4: Conversation list page + create action + nav link

**Files:**
- Create: `app/(app)/chat/page.tsx`, `app/(app)/chat/actions.ts`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`; `requireUser` from `@/lib/access`;
  `createConversationSchema` from `@/lib/validation`.
- Produces: `createConversation(formData)` Server Action, redirects to `/chat/[id]` on
  success — Task 5's page is that destination.

- [ ] **Step 1: Write the create-conversation action**

Create `app/(app)/chat/actions.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/access'
import { createConversationSchema } from '@/lib/validation'

export async function createConversation(formData: FormData) {
  const user = await requireUser()

  const parsed = createConversationSchema.safeParse({
    provider: formData.get('provider'),
  })

  if (!parsed.success) {
    redirect('/chat?error=' + encodeURIComponent(parsed.error.issues[0].message))
  }

  const supabase = await createClient()
  const { data: conversation, error } = await supabase
    .from('chat_conversations')
    .insert({ user_id: user.id, provider: parsed.data.provider })
    .select('id')
    .single()

  if (error || !conversation) {
    redirect('/chat?error=' + encodeURIComponent(error?.message ?? 'Failed to start conversation'))
  }

  redirect(`/chat/${conversation.id}`)
}
```

- [ ] **Step 2: Write the conversation list page**

Create `app/(app)/chat/page.tsx`:

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createConversation } from './actions'

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: conversations } = await supabase
    .from('chat_conversations')
    .select('id, title, provider, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">New conversation</h1>
        {error && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        <form action={createConversation} className="mt-3 flex items-center gap-2">
          <select name="provider" className="rounded border px-3 py-2">
            <option value="claude">Claude</option>
            <option value="chatgpt">ChatGPT</option>
          </select>
          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Start chat
          </button>
        </form>
      </div>

      <div>
        <h1 className="text-lg font-semibold">Your conversations</h1>
        {conversations && conversations.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {conversations.map((conversation) => (
              <li key={conversation.id} className="rounded border p-3">
                <Link href={`/chat/${conversation.id}`} className="text-blue-600 hover:underline">
                  {conversation.title}
                </Link>
                <span className="ml-2 text-sm text-gray-500">
                  {conversation.provider === 'claude' ? 'Claude' : 'ChatGPT'} ·{' '}
                  {new Date(conversation.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-gray-500">No conversations yet.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add the nav link**

In `app/(app)/layout.tsx`, the nav currently reads:

```tsx
          <Link href="/dashboard" className="text-sm text-gray-600 hover:text-black">
            Dashboard
          </Link>
          <Link href="/leads" className="text-sm text-gray-600 hover:text-black">
            Leads
          </Link>
```

Change it to add a "Chat" link right after "Dashboard" and before "Leads":

```tsx
          <Link href="/dashboard" className="text-sm text-gray-600 hover:text-black">
            Dashboard
          </Link>
          <Link href="/chat" className="text-sm text-gray-600 hover:text-black">
            Chat
          </Link>
          <Link href="/leads" className="text-sm text-gray-600 hover:text-black">
            Leads
          </Link>
```

(Everything else in the file stays unchanged.)

- [ ] **Step 4: Verify the build**

```bash
npm run build
```

Expected: succeeds. Route table should include `/chat`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/chat/page.tsx" "app/(app)/chat/actions.ts" "app/(app)/layout.tsx"
git commit -m "feat: add conversation list page and create-conversation action"
```

---

### Task 5: Conversation page + streaming chat window

**Files:**
- Create: `app/(app)/chat/[id]/page.tsx`, `app/(app)/chat/[id]/chat-window.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`; the `POST /api/chat` Route Handler
  from Task 3 (request body shape: `{ messages, provider, conversationId }`); `ChatProvider`
  from `@/types/database`.

- [ ] **Step 1: Write the conversation page**

Create `app/(app)/chat/[id]/page.tsx`:

```tsx
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
```

- [ ] **Step 2: Write the chat window client component**

Create `app/(app)/chat/[id]/chat-window.tsx`:

```tsx
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
```

- [ ] **Step 3: Verify the build**

```bash
npm run build
```

Expected: succeeds with no type errors, zero `any`.

- [ ] **Step 4: Manually verify (requires Task 1's migration live and env vars set — see Task 6)**

This step can't be fully exercised until Task 6 adds the API keys. Skip live testing here
and rely on the build passing; Task 6's manual verification covers the full flow.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/chat/[id]/page.tsx" "app/(app)/chat/[id]/chat-window.tsx"
git commit -m "feat: add conversation page with streaming chat window"
```

---

### Task 6: API keys (MANUAL — human step) + end-to-end verification

**Files:** none (env var configuration + verification only)

- [ ] **Step 1: Human adds the API keys**

Hand these instructions to the user:

1. Get an Anthropic API key (console.anthropic.com) and an OpenAI API key
   (platform.openai.com), if you don't already have them.
2. Locally: add `ANTHROPIC_API_KEY=...` and `OPENAI_API_KEY=...` to `.env.local`.
3. On Vercel: project Settings → Environment Variables → add the same two, for Production
   (and Preview if you want branch deploys to work too).

- [ ] **Step 2: Manually verify the full flow**

```bash
npm run dev
```

In the browser, logged in as any employee:
1. Click "Chat" in the nav — lands on `/chat`, shows the "New conversation" form and an
   empty "Your conversations" list.
2. Select "Claude", click "Start chat" — redirected to `/chat/<new-id>`, empty chat window.
3. Type a message, send it — confirm the response streams in token-by-token, not all at
   once.
4. Go back to `/chat` — the new conversation now appears in "Your conversations".
5. Click back into it — confirm the earlier exchange (your message + Claude's reply) is
   still there, loaded from the database.
6. Repeat steps 2-3 with "ChatGPT" selected — confirm it works too.
7. Temporarily rename `ANTHROPIC_API_KEY` to something else in `.env.local`, restart the
   dev server, start a new Claude conversation, send a message — confirm you see the
   inline "Claude isn't configured" error, not a crash or infinite spinner. Restore the
   env var afterward and restart the dev server again.
8. Clean up any test conversations you created via direct database access (there's no
   delete UI in this sub-project), so the live database stays clean — consistent with how
   earlier sub-projects' QA was left.

- [ ] **Step 3: No commit** — this task is verification only, nothing to commit.
