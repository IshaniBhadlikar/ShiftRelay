/**
 * Live board data: shifts + claims + decisions over useQuery, joined by the
 * shared buildBoard/deriveShiftState (src/lib/shift-state.ts).
 *
 * Decisions are loaded unfiltered on purpose: the state of a claimed shift
 * depends on its decision, and a `limit` could drop an old approval and show
 * a covered shift as claimed. Fine at one-workplace scale (see NOTES "Later").
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'deepspace'
import { buildBoard, type ClaimData, type DecisionData, type ShiftData, type ShiftView } from './shift-state'

export function useBoardData() {
  const shifts = useQuery<ShiftData>('shifts', { orderBy: 'startsAt', orderDir: 'asc' })
  const claims = useQuery<ClaimData>('claims')
  const decisions = useQuery<DecisionData>('decisions')

  const views: ShiftView[] = useMemo(
    () =>
      buildBoard(shifts.records, claims.records, decisions.records).sort((a, b) =>
        a.shift.startsAt.localeCompare(b.shift.startsAt),
      ),
    [shifts.records, claims.records, decisions.records],
  )

  const all = [shifts, claims, decisions]
  const status = all.some((q) => q.status === 'error') ? 'error' : all.some((q) => q.status === 'loading') ? 'loading' : 'ready'
  const error = all.find((q) => q.error)?.error

  return { status, error, views, claims: claims.records, decisions: decisions.records, shifts: shifts.records } as const
}

/** Current time, refreshed every 30s so shifts leave the board when they end. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
