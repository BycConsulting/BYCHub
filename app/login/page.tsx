import Image from 'next/image'
import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form
        action={login}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_1px_2px_0_rgba(30,41,59,0.06),0_2px_6px_-1px_rgba(30,41,59,0.08)]"
      >
        <div className="text-center">
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
        </div>
        {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/30"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700 active:scale-[0.98] transition-transform"
        >
          Sign In
        </button>
      </form>
    </div>
  )
}
