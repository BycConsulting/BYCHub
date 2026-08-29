import Link from 'next/link'
import { requireModule } from '@/lib/access'

export default async function SettingsPage() {
  const currentUser = await requireModule('settings')

  const providers = [
    { name: 'Claude', configured: Boolean(process.env.ANTHROPIC_API_KEY) },
    { name: 'ChatGPT', configured: Boolean(process.env.OPENAI_API_KEY) },
  ]

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-slate-800">Settings</h1>
      {currentUser.role === 'admin' && (
        <Link href="/settings/permissions" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">
          Edit role permissions
        </Link>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-slate-500">AI provider API keys</h2>
        <ul className="mt-2 space-y-2">
          {providers.map((provider) => (
            <li
              key={provider.name}
              className="flex items-center gap-2 rounded-lg border border-slate-100 p-3 text-sm"
            >
              <span className="w-24 text-slate-700">{provider.name}</span>
              <span className={provider.configured ? 'text-green-700' : 'text-yellow-700'}>
                {provider.configured ? 'Configured' : 'Not configured'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-400">
          Add ANTHROPIC_API_KEY / OPENAI_API_KEY as environment variables on Vercel (and locally in .env.local) to
          configure a provider.
        </p>
      </div>
    </div>
  )
}
