import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { fail, getMember, getShiftStatus } from './lib'

const DAILY_CLAIM_CAP = 5
const DAY_MS = 24 * 60 * 60 * 1000
export const ALREADY_CLAIMED = 'Someone already claimed this shift.'

/**
 * Soft cap: the caller's claim attempts in the last 24h on shifts that haven't
 * started. Attempts = current claims + rejected/released decisions (claims
 * that were deleted). Deduped by claimId. Not atomic — soft by design.
 */
async function countRecentClaimAttempts(tools: ActionTools, userId: string, now: string): Promise<number> {
  const since = new Date(Date.parse(now) - DAY_MS).toISOString()
  const attempts = new Map<string, string>() // claimId → shiftId

  const claims = await tools.query<{ shiftId: string; createdAt: string }>('claims', {
    where: { claimantId: userId },
    limit: 200,
  })
  if (claims.success) {
    for (const c of claims.data.records) {
      if (c.data.createdAt >= since) attempts.set(c.recordId, c.data.shiftId)
    }
  }
  const decisions = await tools.query<{ claimId: string; shiftId: string; outcome: string; at: string }>('decisions', {
    where: { claimantId: userId },
    limit: 200,
  })
  if (decisions.success) {
    for (const d of decisions.data.records) {
      const ended = d.data.outcome === 'rejected' || d.data.outcome === 'released'
      if (ended && d.data.at >= since) attempts.set(d.data.claimId, d.data.shiftId)
    }
  }

  const startsAt = new Map<string, string | null>()
  let count = 0
  for (const shiftId of attempts.values()) {
    if (!startsAt.has(shiftId)) {
      const s = await tools.get<{ startsAt: string }>('shifts', shiftId)
      startsAt.set(shiftId, s.success ? s.data.record.data.startsAt : null)
    }
    const start = startsAt.get(shiftId)
    if (start && start > now) count++
  }
  return count
}

export const claimActions: Record<string, ActionHandler<Env>> = {
  /**
   * Claim someone else's open, not-yet-started shift. Only `shiftId` is read
   * from params; claimant is always ctx.userId. uniqueOn ['shiftId'] makes the
   * write atomic — the loser of a race gets ALREADY_CLAIMED.
   */
  claimShift: async ({ userId, params, tools }) => {
    const member = await getMember(tools, userId)
    if (!member) return fail('Join the team before claiming a shift.')

    const shiftId = typeof params.shiftId === 'string' ? params.shiftId : ''
    const shiftRes = shiftId ? await tools.get<{ postedBy: string; startsAt: string }>('shifts', shiftId) : null
    if (!shiftRes?.success) return fail('Shift not found.')
    const shift = shiftRes.data.record.data

    if (shift.postedBy === userId) return fail("You can't claim your own shift.")
    const now = new Date().toISOString()
    if (shift.startsAt <= now) return fail('This shift has already started.')

    const status = await getShiftStatus(tools, shiftId)
    if (status.state === 'claimed') return fail(ALREADY_CLAIMED)
    if (status.state === 'covered') return fail('This shift is already covered.')

    if ((await countRecentClaimAttempts(tools, userId, now)) >= DAILY_CLAIM_CAP) {
      return fail(`You've reached the limit of ${DAILY_CLAIM_CAP} claims per day.`)
    }

    // Stale claim (rejected/released): delete by ITS recordId only — never by
    // shiftId — so a slow caller can't delete a fresh claim someone else just
    // made. Not-found is fine (another caller already cleaned it up).
    if (status.claim && status.decision && status.decision.outcome !== 'approved') {
      await tools.remove('claims', status.claim.recordId)
    }

    const created = await tools.create('claims', {
      shiftId,
      claimantId: userId,
      claimantName: member.displayName || 'Team member',
      createdAt: now,
    })
    if (!created.success) {
      return created.error.startsWith('Duplicate:') ? fail(ALREADY_CLAIMED) : fail(`Could not claim shift: ${created.error}`)
    }

    const stored = await tools.get('claims', created.data.recordId)
    if (!stored.success) return fail(`Could not read claim: ${stored.error}`)
    return { success: true, data: { claimId: created.data.recordId, claim: stored.data.record.data } }
  },
}
