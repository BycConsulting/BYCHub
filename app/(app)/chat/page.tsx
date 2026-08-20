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
