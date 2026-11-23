/**
 * Shared helpers for ShiftRelay server actions.
 * Actions run with RBAC OFF — every check lives in the action itself.
 */
import type { ActionResult, ActionTools } from 'deepspace/worker'

export type Role = 'worker' | 'manager'
export type ShiftState = 'open' | 'claimed' | 'covered'
type Envelope = { recordId: string; data: Record<string, unknown> }

export const fail = (error: string): ActionResult => ({ success: false, error })

/**
 * Profile from the caller's JWT. `callerJwt` is the same Bearer token that
 * `resolveAuth` verified (signature, issuer, exp) before the action ran — see
 * NOTES.md for the line citations — so decoding it here reads verified claims.
 * (Pasted from the taskspace example.)
 */
export async function getVerifiedProfile(
  tools: ActionTools,
  userId: string,
  callerJwt: string,
): Promise<{ email: string; name: string; image: string }> {
  let email = ''
  let name = ''
  let image = ''
  try {
    const part = callerJwt.split('.')[1]
    if (part) {
      const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
      const claims = JSON.parse(json) as { sub?: string; email?: string; name?: string; image?: string }
      if (claims.sub === userId) {
        email = (claims.email || '').toLowerCase()
        name = claims.name || ''
        image = claims.image || ''
      }
    }
  } catch { /* fall through to directory lookup */ }
  if (!email) {
    const res = await tools.get('users', userId)
    if (res.success) {
      const record = (res.data as { record?: Envelope }).record
      const dirEmail = record?.data?.email
      if (typeof dirEmail === 'string' && dirEmail) email = dirEmail.toLowerCase()
    }
  }
  return { email, name, image }
}

/** The caller's team_members row, or null if they haven't joined. */
export async function getMember(
  tools: ActionTools,
  userId: string,
): Promise<{ role: Role; displayName: string } | null> {
  const res = await tools.get<{ role?: string; displayName?: string }>('team_members', userId)
  if (!res.success) return null
  const { role, displayName } = res.data.record.data
  if (role !== 'worker' && role !== 'manager') return null
  return { role, displayName: displayName ?? '' }
}

// ISO-8601 date-time with an EXPLICIT offset. Offset-less strings are refused
// because the worker would silently read them as UTC, not the user's local time.
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/

/** Normalize to UTC `toISOString()`, or null if not an ISO date-time with a timezone. */
export function parseUtcIso(value: unknown): string | null {
  if (typeof value !== 'string' || !ISO_WITH_OFFSET.test(value)) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/**
 * Derived shift state (CLAUDE.md): no claim → open; claim without decision →
 * claimed; approved → covered; rejected/released → open (stale claim).
 */
export async function getShiftState(tools: ActionTools, shiftId: string): Promise<ShiftState> {
  const claims = await tools.query('claims', { where: { shiftId }, limit: 1 })
  const claim = claims.success ? claims.data.records[0] : undefined
  if (!claim) return 'open'
  const decisions = await tools.query<{ outcome?: string }>('decisions', {
    where: { claimId: claim.recordId },
    limit: 1,
  })
  const decision = decisions.success ? decisions.data.records[0] : undefined
  if (!decision) return 'claimed'
  return decision.data.outcome === 'approved' ? 'covered' : 'open'
}
