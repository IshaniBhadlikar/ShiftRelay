/**
 * Audit list of decisions (approved / rejected / released), newest first.
 * Actor names come from the room roster (useUsers: public id + name only);
 * the claimant's name is stored on the decision itself.
 */
import { useMemo } from 'react'
import { useUsers } from 'deepspace'
import { cn } from '@/lib/utils'
import { formatDay, formatStamp, formatTimeRange } from '@/lib/format'
import type { DecisionData, ShiftData } from '@/lib/shift-state'

type Row<T> = { recordId: string; data: T }

const OUTCOME_LABEL = { approved: 'Approved', rejected: 'Rejected', released: 'Released' } as const

export function DecisionList({
  decisions,
  shifts,
  viewerId,
  limit,
  'data-testid': testId,
}: {
  decisions: Row<DecisionData>[]
  shifts: Row<ShiftData>[]
  viewerId: string
  limit?: number
  'data-testid'?: string
}) {
  const { users } = useUsers()
  const nameOf = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users])
  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.recordId, s.data])), [shifts])

  const rows = useMemo(() => {
    const sorted = [...decisions].sort((a, b) => b.data.at.localeCompare(a.data.at))
    return limit ? sorted.slice(0, limit) : sorted
  }, [decisions, limit])

  return (
    <ul data-testid={testId} className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {rows.map((d) => {
        const { outcome, actorId, claimantId, claimantName, shiftId, at } = d.data
        const shift = shiftById.get(shiftId)
        const claimant = claimantId === viewerId ? 'you' : claimantName || 'a teammate'
        const claimantPossessive = claimantId === viewerId ? 'your' : `${claimantName || 'a teammate'}'s`
        const actor = actorId === viewerId ? 'You' : nameOf.get(actorId) || 'A manager'
        const sentence =
          outcome === 'released'
            ? `${claimant === 'you' ? 'You' : claimant} released ${claimant === 'you' ? 'your' : 'their'} claim`
            : `${actor} ${outcome} ${claimantPossessive} claim`
        return (
          <li key={d.recordId} data-testid="decision-row" className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3 text-sm">
            <span
              className={cn(
                'mt-0.5 w-20 shrink-0 rounded-sm border px-1.5 py-px text-center text-xs font-medium',
                outcome === 'approved' && 'border-covered/40 bg-covered-soft text-covered',
                outcome === 'rejected' && 'border-destructive/30 text-destructive',
                outcome === 'released' && 'border-border text-muted-foreground',
              )}
            >
              {OUTCOME_LABEL[outcome] ?? outcome}
            </span>
            <div className="min-w-0 flex-1">
              <p>
                {sentence}
                {shift && (
                  <>
                    {' '}
                    on <span className="font-medium">{shift.title}</span>
                  </>
                )}
              </p>
              {shift && (
                <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                  {formatDay(shift.startsAt)} · {formatTimeRange(shift.startsAt, shift.endsAt)}
                </p>
              )}
            </div>
            <time dateTime={at} className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {formatStamp(at)}
            </time>
          </li>
        )
      })}
    </ul>
  )
}
