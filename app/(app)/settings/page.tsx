import { requireAdmin } from '@/lib/access'

export default async function SettingsPage() {
  await requireAdmin()

  const providers = [
    { name: 'Claude', configured: Boolean(process.env.ANTHROPIC_API_KEY) },
    { name: 'ChatGPT', configured: Boolean(process.env.OPENAI_API_KEY) },
  ]

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Settings</h1>
      <div>
        <h2 className="text-sm font-medium text-gray-500">AI provider API keys</h2>
        <ul className="mt-2 space-y-2">
          {providers.map((provider) => (
            <li key={provider.name} className="flex items-center gap-2 rounded border p-3 text-sm">
              <span className="w-24">{provider.name}</span>
              <span className={provider.configured ? 'text-green-700' : 'text-yellow-700'}>
                {provider.configured ? 'Configured' : 'Not configured'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-gray-500">
          Add ANTHROPIC_API_KEY / OPENAI_API_KEY as environment variables on Vercel (and locally in .env.local) to
          configure a provider.
        </p>
      </div>
    </div>
  )
}
