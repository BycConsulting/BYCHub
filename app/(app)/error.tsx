'use client'

import { Button } from '@/components/ui/button'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md space-y-4 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">{error.message || 'An unexpected error occurred.'}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
