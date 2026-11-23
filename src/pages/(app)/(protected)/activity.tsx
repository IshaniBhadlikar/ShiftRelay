/**
 * My activity: shifts I posted, my current claims, and decisions involving me
 * (on my claims, or — for managers — made by me), from the decisions audit.
 */
import { useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Hand, History } from 'lucide-react'
import { EmptyState } from '@/components/ui'
import { ShiftCard } from '@/components/ShiftCard'
import { DecisionList } from '@/components/DecisionList'
import { useTeam } from '@/lib/team'
import { useBoardData, useNow } from '@/lib/use-board'

export default function ActivityPage() {
  const team = useTeam()
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-10 sm:pt-14">
      <h1 className="text-3xl font-semibold tracking-tight">My activity</h1>
      <p className="mt-2 text-muted-foreground">What you&apos;ve posted, what you&apos;ve claimed, and how each claim was decided.</p>
      {team.status === 'ready' ? <Activity viewerId={team.userId} /> : <ActivitySkeleton />}
    </div>
  )
}

function Activity({ viewerId }: { viewerId: string }) {
  const navigate = useNavigate()
  const now = useNow()
  const { status, error, views, decisions, shifts } = useBoardData()

  const posted = useMemo(
    () =>
      views
        .filter((v) => v.shift.postedBy === viewerId && Date.parse(v.shift.endsAt) > now.getTime())
        .sort((a, b) => a.shift.startsAt.localeCompare(b.shift.startsAt)),
    [views, viewerId, now],
  )
  // Live claims (pending or approved; buildBoard drops stale rejected/released rows) on shifts that
  // haven't ended. Finished history lives in Decisions below.
  const claimed = useMemo(
    () =>
      views
        .filter((v) => v.claim?.data.claimantId === viewerId && Date.parse(v.shift.endsAt) > now.getTime())
        .sort((a, b) => a.shift.startsAt.localeCompare(b.shift.startsAt)),
    [views, viewerId, now],
  )
  const mine = useMemo(
    () => decisions.filter((d) => d.data.claimantId === viewerId || d.data.actorId === viewerId),
    [decisions, viewerId],
  )

  if (status === 'loading') return <ActivitySkeleton />
  if (status === 'error') {
    return (
      <p role="alert" className="mt-8 rounded-lg border border-border bg-card p-4 text-sm text-destructive">
        {error ?? 'Could not load your activity.'}
      </p>
    )
  }

  return (
    <div className="mt-10 flex flex-col gap-12">
      <Section title="Your claims" count={claimed.length} testId="activity-claims">
        {claimed.length ? (
          <ul className="flex flex-col gap-3">
            {claimed.map((v) => (
              <li key={v.shiftId}>
                <ShiftCard view={v} viewer={{ userId: viewerId }} now={now} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            className="rounded-lg border border-dashed border-border py-10"
            icon={<Hand />}
            title="No claims right now"
            description="Claim an open shift on the board and it shows up here until it's decided."
            action={{ label: 'Open the board', onClick: () => navigate('/home') }}
          />
        )}
      </Section>

      <Section title="Upcoming shifts you posted" count={posted.length} testId="activity-posted">
        {posted.length ? (
          <ul className="flex flex-col gap-3">
            {posted.map((v) => (
              <li key={v.shiftId}>
                <ShiftCard view={v} viewer={{ userId: viewerId }} now={now} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            className="rounded-lg border border-dashed border-border py-10"
            icon={<ClipboardList />}
            title="You haven't posted a shift"
            description="Can't make a shift? Post it and a coworker can claim it."
            action={{ label: 'Post a shift', onClick: () => navigate('/post') }}
          />
        )}
      </Section>

      <Section title="Decisions" count={mine.length} testId="activity-decisions">
        {mine.length ? (
          <DecisionList decisions={mine} shifts={shifts} viewerId={viewerId} />
        ) : (
          <EmptyState
            className="rounded-lg border border-dashed border-border py-10"
            icon={<History />}
            title="No decisions yet"
            description="When a claim of yours is approved, rejected or released, it's recorded here."
          />
        )}
      </Section>
    </div>
  )
}

function Section({ title, count, testId, children }: { title: string; count: number; testId: string; children: ReactNode }) {
  return (
    <section data-testid={testId} aria-label={title}>
      <h2 className="mb-4 flex items-baseline gap-2 text-lg font-semibold">
        {title}
        <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">{count}</span>
      </h2>
      {children}
    </section>
  )
}

function ActivitySkeleton() {
  return (
    <div aria-busy="true" className="mt-10 flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <div className="h-4 w-36 animate-pulse rounded-md bg-muted" />
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        </div>
      ))}
    </div>
  )
}
