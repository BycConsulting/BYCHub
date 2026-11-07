import Image from 'next/image'
import { login } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-sidebar-primary/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-primary/40 blur-3xl" />
        <div className="relative w-fit rounded-xl bg-white px-4 py-3 shadow-sm">
          <Image src="/byc-logo.png" alt="BYC Consulting" width={1600} height={664} priority className="h-10 w-auto" />
        </div>
        <div className="relative space-y-3">
          <p className="text-xs font-semibold tracking-widest text-sidebar-primary uppercase">BYC Hub</p>
          <h2 className="max-w-md text-4xl leading-tight font-semibold tracking-tight text-sidebar-accent-foreground">
            One place for clients, people and work.
          </h2>
          <p className="max-w-md text-sm text-sidebar-foreground/70">
            Leads, tasks, HR and finance for the whole BYC team, in a single workspace.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-6">
          <Image
            src="/byc-logo.png"
            alt="BYC Consulting"
            width={1600}
            height={664}
            priority
            className="h-10 w-auto lg:hidden"
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to continue to BYC Hub.</p>
          </div>
          <form action={login} className="space-y-4">
            {error && (
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground/75" htmlFor="email">
                Email
              </label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground/75" htmlFor="password">
                Password
              </label>
              <Input id="password" name="password" type="password" required autoComplete="current-password" />
            </div>
            <Button type="submit" size="lg" className="w-full">
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
