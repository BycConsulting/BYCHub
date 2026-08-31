'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/**
 * Only rendered next to the specific user a plain delete attempt was just
 * blocked for (see deleteUser's blockedUserId redirect param). The blocker
 * detail (exactly which tables/counts) is already shown in the page's error
 * banner above — this is the escalation, not a shortcut around the guard.
 */
export function ForceDeleteUserButton({
  userId,
  userEmail,
  action,
}: {
  userId: string
  userEmail: string
  action: (formData: FormData) => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const matches = confirmText === userEmail

  return (
    <form action={action} className="mt-1 space-y-1.5 rounded-lg border border-red-200 bg-red-50 p-2">
      <input type="hidden" name="userId" value={userId} />
      <p className="text-xs text-red-700">This permanently deletes their history too — see the error above.</p>
      <Input
        type="text"
        value={confirmText}
        onChange={(event) => setConfirmText(event.target.value)}
        placeholder={`Type "${userEmail}" to confirm`}
        className="h-7 text-xs"
      />
      <label className="flex items-center gap-2 text-xs text-red-700">
        <input
          type="checkbox"
          name="acknowledged"
          required
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          className="h-3.5 w-3.5 accent-red-600"
        />
        I understand this permanently deletes their history
      </label>
      <Button type="submit" variant="destructive" size="sm" disabled={!matches || !acknowledged}>
        Force delete permanently
      </Button>
    </form>
  )
}
