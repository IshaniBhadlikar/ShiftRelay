/**
 * Example gated page. Reached at /settings — no auth logic lives here
 * because (protected)/_layout.tsx already wraps the subtree in <AuthGate>.
 */

import { useState, type FormEvent } from 'react'
import { signOut, useUser } from 'deepspace'
import { ShieldCheck } from 'lucide-react'
import { Button, Input, Label, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import { useAction } from '@/lib/use-action'
import { useTeam } from '@/lib/team'

/**
 * Become a manager by redeeming an invite code (redeemManagerInvite). The
 * server checks the code; the role then arrives live through useTeam().
 */
function ManagerInviteSection() {
  const team = useTeam()
  const { success } = useToast()
  const { busy, error, run } = useAction()
  const [code, setCode] = useState('')

  async function redeem(e: FormEvent) {
    e.preventDefault()
    const res = await run('redeemManagerInvite', { code: code.trim() })
    if (res?.success) {
      setCode('')
      success("You're a manager now", 'The approval queue is in the navigation.')
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-6" data-testid="manager-invite-section">
      <h2 className="mb-2 text-lg font-semibold">Become a manager</h2>
      {team.status === 'ready' && team.isManager ? (
        <p className="flex items-center gap-2 text-sm text-covered" data-testid="manager-status">
          <ShieldCheck className="size-4" aria-hidden /> You&apos;re a manager. You can approve and reject claims.
        </p>
      ) : (
        <form onSubmit={redeem} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Managers approve and reject claims. If you were given an invite code, enter it here.
          </p>
          <Label htmlFor="invite-code" className="mt-1">
            Invite code
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="invite-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              aria-invalid={!!error}
            />
            <Button type="submit" loading={busy} disabled={!code.trim() || team.status !== 'ready'}>
              Redeem
            </Button>
          </div>
          {error && (
            <p role="alert" data-testid="invite-error" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  )
}

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
  const team = useTeam()

  return (
    // No background on page wrappers — pages render into whatever the app's
    // (app)/_layout provides (a plain background, or a raised panel), so they
    // stay transparent and inherit it.
    <div className="min-h-full text-foreground">
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-10 sm:pt-14">
        <h1 className="mb-8 text-3xl font-semibold tracking-tight">Settings</h1>

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
            <div>
              <dt className="text-muted-foreground">Team role</dt>
              <dd className="text-foreground" data-testid="team-role">
                {team.status === 'ready' ? (team.isManager ? 'Manager' : 'Worker') : '—'}
              </dd>
            </div>
          </dl>

          <Button variant="secondary" className="mt-6" onClick={() => signOut()}>
            Sign out
          </Button>
        </section>

        <ManagerInviteSection />

        {user?.role === 'admin' && <DemoDataSection />}
      </div>
    </div>
  )
}
