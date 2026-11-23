/**
 * Example gated page. Reached at /settings — no auth logic lives here
 * because (protected)/_layout.tsx already wraps the subtree in <AuthGate>.
 */

import { useState } from 'react'
import { signOut, useUser } from 'deepspace'
import { Button } from '@/components/ui'
import { callAction } from '@/lib/actions'

/**
 * Owner-only. Visibility is cosmetic (platform `admin` is the app owner only —
 * we never use setRole); the seedDemo action itself enforces OWNER_USER_ID.
 */
function DemoDataSection() {
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; message?: string }>({ kind: 'idle' })

  async function reset() {
    setStatus({ kind: 'busy' })
    const res = await callAction('seedDemo')
    setStatus(res.success ? { kind: 'ok', message: 'Demo data ready.' } : { kind: 'error', message: res.error })
  }

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-6" data-testid="demo-data-section">
      <h2 className="mb-2 text-lg font-semibold">Demo data (owner only)</h2>
      <p className="text-sm text-muted-foreground">
        Restores the demo coworkers, their open shifts and one pending claim. Only demo data is changed.
      </p>
      <Button className="mt-4" onClick={reset} disabled={status.kind === 'busy'}>
        {status.kind === 'busy' ? 'Resetting…' : 'Reset demo data'}
      </Button>
      {status.message && (
        <p role="status" className={`mt-3 text-sm ${status.kind === 'error' ? 'text-destructive' : 'text-foreground'}`}>
          {status.message}
        </p>
      )}
    </section>
  )
}

export default function SettingsPage() {
  const { user } = useUser()

  return (
    // No background on page wrappers — pages render into whatever the app's
    // (app)/_layout provides (a plain background, or a raised panel), so they
    // stay transparent and inherit it.
    <div className="min-h-full text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-20">
        <h1 className="mb-12 text-4xl font-bold tracking-tight">Settings</h1>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Your account</h2>

          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="text-foreground">{user?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="text-foreground">{user?.email ?? '—'}</dd>
            </div>
          </dl>

          <Button variant="secondary" className="mt-6" onClick={() => signOut()}>
            Sign out
          </Button>
        </section>

        {user?.role === 'admin' && <DemoDataSection />}
      </div>
    </div>
  )
}
