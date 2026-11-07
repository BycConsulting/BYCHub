import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <p className="text-sm font-semibold tracking-widest text-gold uppercase">404</p>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">That page doesn’t exist or you don’t have access to it.</p>
      <Button asChild>
        <Link href="/">Back to BYC Hub</Link>
      </Button>
    </div>
  )
}
