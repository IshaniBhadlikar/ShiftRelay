/**
 * The ONE place shift state is derived (CLAUDE.md: state is derived, never
 * stored). Used by the server (src/actions/lib.ts getShiftStatus) and by the
 * client (buildBoard below), so the two can never disagree.
 *
 * Pure and dependency-free: safe to import from the worker and the browser.
 */

export type ShiftState = 'open' | 'claimed' | 'covered'
export type Outcome = 'approved' | 'rejected' | 'released'

/** Longest allowed shift (inclusive). Shared by postShift and the post form. */
export const MAX_SHIFT_HOURS = 24
export const SHIFT_TOO_LONG = `A shift can be at most ${MAX_SHIFT_HOURS} hours long.`
export const isShiftTooLong = (startsAt: string, endsAt: string) =>
  Date.parse(endsAt) - Date.parse(startsAt) > MAX_SHIFT_HOURS * 60 * 60 * 1000

/**
 * - no claim                        → open
 * - claim, no decision              → claimed
 * - claim + approved decision       → covered
 * - claim + rejected/released       → open (stale claim, cleaned up lazily)
 */
export function deriveShiftState(hasClaim: boolean, outcome: string | null | undefined): ShiftState {
  if (!hasClaim) return 'open'
  if (!outcome) return 'claimed'
  return outcome === 'approved' ? 'covered' : 'open'
}

// ── Client-side board assembly ─────────────────────────────────────────────

export type ShiftData = {
  title: string
  startsAt: string
  endsAt: string
  notes?: string
  postedBy: string
  posterName: string
}
export type ClaimData = { shiftId: string; claimantId: string; claimantName: string; createdAt: string }
export type DecisionData = {
  claimId: string
  shiftId: string
  outcome: Outcome
  actorId: string
  at: string
  claimantId: string
  claimantName?: string
}
type Row<T> = { recordId: string; data: T }

export type ShiftView = {
  shiftId: string
  shift: ShiftData
  state: ShiftState
  /** The live claim row, only while it is pending or approved (not stale). */
  claim?: Row<ClaimData>
}

export const isDemoId = (recordId: string) => recordId.startsWith('demo-')

/**
 * Join shifts + claims + decisions into per-shift views. claims.uniqueOn
 * ['shiftId'] means at most one claim row per shift; decisions.uniqueOn
 * ['claimId'] means at most one decision per claim.
 */
export function buildBoard(
  shifts: Row<ShiftData>[],
  claims: Row<ClaimData>[],
  decisions: Row<DecisionData>[],
): ShiftView[] {
  const claimByShift = new Map(claims.map((c) => [c.data.shiftId, c]))
  const outcomeByClaim = new Map(decisions.map((d) => [d.data.claimId, d.data.outcome]))
  return shifts.map((s) => {
    const claim = claimByShift.get(s.recordId)
    const state = deriveShiftState(!!claim, claim ? outcomeByClaim.get(claim.recordId) : undefined)
    return { shiftId: s.recordId, shift: s.data, state, claim: state === 'open' ? undefined : claim }
  })
}
