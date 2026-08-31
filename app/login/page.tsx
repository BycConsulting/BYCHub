import Image from 'next/image'
import { login } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Image
            src="/byc-logo.png"
            alt="BYC Consulting"
            width={1600}
            height={664}
            priority
            className="mx-auto mb-4 h-10 w-auto"
          />
          <h1 className="text-xl font-semibold text-slate-800">BYC Hub</h1>
          <p className="mt-1 text-sm text-slate-500">Please sign in to continue.</p>
        </CardHeader>
        <CardContent>
          <form action={login} className="space-y-4">
            {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>}
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="email">
                Email
              </label>
              <Input id="email" name="email" type="email" required className="mt-1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="password">
                Password
              </label>
              <Input id="password" name="password" type="password" required className="mt-1" />
            </div>
            <Button type="submit" className="w-full">
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
