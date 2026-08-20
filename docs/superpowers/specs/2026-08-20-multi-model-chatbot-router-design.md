# Multi-Model Chatbot Router — Design Spec

**Date:** 2026-08-20
**Status:** Approved for planning
**Sub-project 6 of 7** in the BYC internal SaaS platform (see decomposition in
[2026-08-19-foundation-crm-core-design.md](2026-08-19-foundation-crm-core-design.md)).

## Context

Sub-projects 1 and 2 (Foundation + CRM core, Dashboards + KPI engine) shipped: employee
auth, a CRM covering leads through active clients, and a team-wide metrics dashboard. This
sub-project is independent of the CRM data model — it gives employees a single place to
chat with either Claude or ChatGPT, so the team can use whichever provider currently has
available credit/budget, without juggling separate accounts or tools. "Codex" (mentioned
in the original platform ask) is out of scope: it's OpenAI's coding-agent product today,
not a chat-completions API like the other two, and would need its own investigation —
deferred, not part of this sub-project.

## Scope of this sub-project

Manual model selection (the employee picks Claude or ChatGPT per conversation — no
automatic routing based on real-time credit balances, since neither provider exposes a
live balance API that would make automatic routing meaningful). One shared company API
key per provider, not per-employee keys. Streaming responses. Conversation history saved
per employee, private by default (no admin oversight of other employees' chats in this
sub-project). No "Codex" support.

## Architecture

New route `/chat`: a Server Component page lists the employee's own conversation history
(queried server-side, scoped to their `user_id` — reuses the existing
`createClient` from `@/lib/supabase/server`) and renders a client-side chat window. A new
Route Handler at `app/api/chat/route.ts` receives `{ provider, conversationId, messages }`,
calls the Vercel AI SDK's `streamText()` with either the Anthropic or OpenAI adapter
depending on `provider`, streams the response back to the browser, and persists the user
message + assistant response to Supabase once the stream completes.

This is the app's first Client Component (`'use client'`) and first Route Handler.
Everything built in sub-projects 1-2 is Server Components + Server Actions, which don't
support token-by-token streaming back to the browser — a chat UI genuinely needs
client-side state to render an incrementally-arriving response, and Server Actions can't
push partial data back mid-execution, so a Route Handler is the correct primitive here,
not a deviation from the established pattern to avoid.

```
Browser (Client Component, useChat hook from the Vercel AI SDK)
  -> POST /api/chat (Route Handler)
    -> streamText() [Vercel AI SDK] -> Anthropic or OpenAI (server-only API keys)
    -> stream back to browser
    -> on completion: persist user + assistant messages to Supabase
```

**New dependencies:** `ai` (Vercel AI SDK core), `@ai-sdk/anthropic`, `@ai-sdk/openai`.
Chosen over hand-rolling provider-specific SSE stream parsing (see the brainstorming
discussion — this SDK exists specifically to normalize the two providers' different
streaming formats behind one call shape, which is the genuinely hard part of this
sub-project).

## Data model

```
chat_conversations   id, user_id, title, provider (claude|chatgpt), created_at, updated_at
chat_messages        id, conversation_id, user_id, role (user|assistant), content, created_at
```

`user_id` is stored directly on both tables (not only reachable by joining through
`conversation_id`) so RLS policies stay simple, direct `auth.uid() = user_id` checks — no
`EXISTS`/subquery pattern.

**RLS is private-per-employee, a different shape from every table in this app so far.**
The CRM tables (`leads`/`clients`/`activities`) are team-wide: any employee can read/write
any row (sub-project 1's employee-membership policies). Chats are private: each employee
can only read/write their own `chat_conversations` and `chat_messages` rows. No admin
oversight or "view another employee's chats" capability exists in this sub-project —
explicit scope decision, matching "your own AI assistant" rather than a shared team
resource like the CRM.

## Model selection

- **Claude** → `claude-sonnet-5` (current default Claude model), via `ANTHROPIC_API_KEY`.
- **ChatGPT** → a current GPT model, via `OPENAI_API_KEY`. Exact model ID pinned at
  plan-writing time (not hardcoded in this spec), since it's an implementation detail
  that may need to match whatever's current when the plan is written.

## Error handling

- **Missing API key**: if `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` isn't set, the route
  handler returns a clear inline error ("Claude isn't configured — ask an admin to add
  ANTHROPIC_API_KEY") rather than crashing or hanging silently.
- **Provider errors** (rate limit, invalid request, provider outage): surfaced as an
  inline error message in the chat UI via the AI SDK's `useChat` hook's built-in error
  state and retry affordance — no custom retry logic needed, the SDK already provides
  this.
- **New env vars**: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` — same pattern as the existing
  `SUPABASE_SERVICE_ROLE_KEY` (server-only secret, added to `.env.local` locally and to
  Vercel's environment variables for production, never exposed to the browser bundle).

## Testing

Manual QA in the dev server, consistent with the platform-wide decision (no automated
test suite — see sub-project 1's spec). Both providers should be manually exercised with
a real conversation during implementation, including the streaming behavior and the
error-state path (e.g. by temporarily removing an API key to confirm the inline error
message, not a crash).

## Out of scope for this sub-project

- "Codex" as a third provider — needs its own investigation (it isn't a chat-completions
  API), deferred to a future sub-project if still wanted.
- Automatic routing/model selection based on real-time credit or budget tracking — no
  provider exposes a live balance API that would make this meaningful; the employee
  picks manually.
- Per-employee API keys / per-employee spend attribution — one shared company key per
  provider for this sub-project.
- Admin visibility into other employees' conversations — chats are private per employee.
- Any integration with the CRM (e.g. "draft an email about this lead" pulling CRM
  context into the chat) — a plain general-purpose chat tool for this sub-project; CRM
  integration would be a future AI-agents-layer concern (sub-project 7).
