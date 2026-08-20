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
