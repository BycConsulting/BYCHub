/**
 * Returns a required environment variable or throws a message that says what is missing and where to set it.
 * Pass the value from a literal `process.env.NAME` reference for NEXT_PUBLIC_ variables so Next can inline them.
 */
export function requireEnv(name: string, env: Record<string, string | undefined> = process.env): string {
  const value = env[name]?.trim()
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Set it in .env.local (local) or in Vercel → Settings → Environment Variables (deployed).`)
  }
  return value
}
