import Link from 'next/link'
import { requireModule } from '@/lib/access'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function SettingsPage() {
  const currentUser = await requireModule('settings')

  const providers = [
    { name: 'Claude', configured: Boolean(process.env.ANTHROPIC_API_KEY) },
    { name: 'ChatGPT', configured: Boolean(process.env.OPENAI_API_KEY) },
  ]

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      {currentUser.role === 'admin' && (
        <Link href="/settings/permissions" className="text-sm text-foreground/75 hover:text-foreground hover:underline">
          Edit role permissions
        </Link>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">AI provider API keys</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {providers.map((provider) => (
              <li
                key={provider.name}
                className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm"
              >
                <span className="w-24 text-foreground/75">{provider.name}</span>
                <Badge variant={provider.configured ? 'default' : 'secondary'}>
                  {provider.configured ? 'Configured' : 'Not configured'}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Add ANTHROPIC_API_KEY / OPENAI_API_KEY as environment variables on Vercel (and locally in .env.local) to
            configure a provider.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
