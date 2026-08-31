'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'

export function DeleteUserButton({
  userId,
  userEmail,
  action,
}: {
  userId: string
  userEmail: string
  action: (formData: FormData) => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const matches = confirmText === userEmail

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <Input
        type="text"
        value={confirmText}
        onChange={(event) => setConfirmText(event.target.value)}
        placeholder={`Type "${userEmail}" to delete`}
        className="h-7 w-48 text-xs"
      />
      <button
        type="submit"
        disabled={!matches}
        className="text-red-600 underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
      >
        Delete
      </button>
    </form>
  )
}
