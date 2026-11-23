/* home pattern: product-preview-first — the live shift board IS home; signed-out visitors see a sample slip and a sign-in prompt */

/**
 * Board: upcoming shifts (not yet ended), soonest first, grouped by local day.
 * Live via useQuery; writes only through server actions (ShiftCard).
 */
import { useMemo, useState } from 'react'
import { AuthOverlay } from 'deepspace'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, Plus, RotateCw } from 'lucide-react'
import { Button, EmptyState } from '@/components/ui'
import { ShiftCard } from '@/components/ShiftCard'
import { ShiftSlip } from '@/components/ShiftSlip'
import { useTeam } from '@/lib/team'
import { useBoardData, useNow } from '@/lib/use-board'
import { dayKey, formatDay } from '@/lib/format'
import type { ShiftView } from '@/lib/shift-state'

export default function BoardPage() {
  const team = useTeam()
  const navigate = useNavigate()

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-10 sm:pt-14">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Shift board</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Shifts your coworkers need covered, soonest first. Claim one, and a manager signs off.
          </p>
        </div>
        {team.status === 'ready' && (
          <Button onClick={() => navigate('/post')}>
            <Plus aria-hidden /> Post a shift
          </Button>
        )}
      </header>

      {team.status === 'signed-out' ? (
        <SignedOutPreview />
      ) : team.status === 'error' ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
          <p className="text-sm">
            <span className="font-medium">Couldn&apos;t join the team.</span>{' '}
            <span className="text-destructive">{team.error}</span>
          </p>
          <Button size="sm" variant="outline" onClick={team.retry}>
            <RotateCw aria-hidden /> Try again
          </Button>
        </div>
      ) : team.status === 'ready' ? (
        <Board viewerId={team.userId} />
      ) : (
        <>
          {team.status === 'joining' && (
            <p className="mb-4 text-sm text-muted-foreground" role="status">
              Adding you to the team…
            </p>
          )}
          <BoardSkeleton />
        </>
      )}
    </div>
  )
}

function Board({ viewerId }: { viewerId: string }) {
  const navigate = useNavigate()
  const { status, error, views } = useBoardData()
  const now = useNow()

  const upcoming = useMemo(() => views.filter((v) => Date.parse(v.shift.endsAt) > now.getTime()), [views, now])
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: ShiftView[] }[] = []
    for (const v of upcoming) {
      const key = dayKey(v.shift.startsAt)
      const last = out[out.length - 1]
      if (last?.key === key) last.items.push(v)
      else out.push({ key, label: formatDay(v.shift.startsAt, now), items: [v] })
    }
    return out
  }, [upcoming, now])

  if (status === 'loading') return <BoardSkeleton />
  if (status === 'error') {
    return (
      <p role="alert" className="rounded-lg border border-border bg-card p-4 text-sm text-destructive">
        {error ?? 'Could not load the board.'}
      </p>
    )
  }
  if (upcoming.length === 0) {
    return (
      <EmptyState
        className="rounded-lg border border-dashed border-border"
        icon={<CalendarClock />}
        title="No upcoming shifts"
        description="When someone posts a shift they need covered, it shows up here."
        action={{ label: 'Post a shift', onClick: () => navigate('/post') }}
      />
    )
  }

  const count = (s: ShiftView['state']) => upcoming.filter((v) => v.state === s).length
  return (
    <>
      <p className="mb-6 font-mono text-xs tabular-nums text-muted-foreground" data-testid="board-summary">
        {count('open')} open · {count('claimed')} awaiting approval · {count('covered')} covered
      </p>
      <div className="flex flex-col gap-8">
        {groups.map((g) => (
          <section key={g.key} aria-labelledby={`day-${g.key}`}>
            <h2 id={`day-${g.key}`} className="mb-3 text-sm font-medium text-muted-foreground">
              {g.label}
            </h2>
            <ul className="flex flex-col gap-3">
              {g.items.map((v) => (
                <li key={v.shiftId}>
                  <ShiftCard view={v} viewer={{ userId: viewerId }} now={now} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}

function BoardSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <div className="mb-3 h-3 w-48 animate-pulse rounded-md bg-muted" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex h-[104px] overflow-hidden rounded-lg border border-border bg-card">
          <div className="w-44 border-r border-dashed border-border p-4">
            <div className="h-3.5 w-28 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="flex-1 space-y-2 p-4">
            <div className="h-4 w-1/2 animate-pulse rounded-md bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Signed out: the same surface in preview form, with an inline sign-in. */
function SignedOutPreview() {
  const [showAuth, setShowAuth] = useState(false)
  const base = new Date()
  base.setDate(base.getDate() + 2)
  base.setHours(9, 0, 0, 0)
  const end = new Date(base)
  end.setHours(13)

  return (
    <div className="flex flex-col gap-6">
      <div className="pointer-events-none select-none" aria-label="Example shift">
        <ShiftSlip
          title="Front desk — morning"
          startsAt={base.toISOString()}
          endsAt={end.toISOString()}
          posterLabel="Posted by Alex"
          state="claimed"
          claimantName="Sam"
          notes="Example. Sign in to see your team's real shifts."
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
        <p className="flex-1 text-sm text-muted-foreground">Sign in to see and claim your team&apos;s shifts.</p>
        <Button onClick={() => setShowAuth(true)}>Sign in</Button>
      </div>
      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </div>
  )
}
