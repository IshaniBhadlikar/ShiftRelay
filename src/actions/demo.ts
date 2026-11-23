/**
 * Demo data for reviewers. Owner-only (`seedDemo`), idempotent: re-running
 * restores a fresh, reviewable state and touches ONLY demo-* rows and rows
 * attached to demo shifts.
 *
 * decisions.uniqueOn ['claimId']: a decided demo-claim-1 could never be decided
 * again, so a re-seed first deletes every decision and claim on the demo shifts
 * (scoped by exact demo shift ids), then re-creates the pending claim.
 */
import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { fail } from './lib'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const DEMO_NOTES = 'Demo data — safe to claim.'

export const DEMO_MEMBERS = [
  { id: 'demo-coworker-1', displayName: 'Demo coworker · Alex' },
  { id: 'demo-coworker-2', displayName: 'Demo coworker · Sam' },
  { id: 'demo-coworker-3', displayName: 'Demo coworker · Priya' },
] as const

// Far out on purpose: reviewers may look days or weeks after submission.
const DEMO_SHIFTS = [
  { id: 'demo-shift-1', title: 'Front desk — morning', poster: 0, offset: 14 * DAY, length: 4 * HOUR },
  { id: 'demo-shift-4', title: 'Stockroom — afternoon', poster: 0, offset: 15 * DAY, length: 4 * HOUR },
  { id: 'demo-shift-2', title: 'Café counter — day', poster: 1, offset: 18 * DAY, length: 6 * HOUR },
  { id: 'demo-shift-3', title: 'Warehouse — full shift', poster: 2, offset: 21 * DAY, length: 8 * HOUR },
] as const

export const DEMO_SHIFT_IDS = DEMO_SHIFTS.map((s) => s.id)
const PENDING = { claimId: 'demo-claim-1', shiftId: 'demo-shift-4', claimant: DEMO_MEMBERS[1] }

/** Shared by seedDemo (owner) and a test-only wrapper in ./dev-only.ts. */
export async function seedDemoData(tools: ActionTools, nowMs: number = Date.now()): Promise<ActionResult> {
  const now = new Date(nowMs).toISOString()
  const base = Math.ceil(nowMs / HOUR) * HOUR // next whole hour, UTC

  // 1. Wipe rows attached to demo shifts only (decisions first, then claims).
  const removed = { claims: 0, decisions: 0 }
  for (const shiftId of DEMO_SHIFT_IDS) {
    for (const collection of ['decisions', 'claims'] as const) {
      const res = await tools.deleteWhere(collection, { shiftId }, 500)
      if (!res.success) return fail(`Could not clear demo ${collection}: ${res.error}`)
      removed[collection] += res.data.deleted
    }
  }

  // 2. Demo coworkers (fixed ids).
  for (const m of DEMO_MEMBERS) {
    const res = await tools.create('team_members', { role: 'worker', displayName: m.displayName }, m.id)
    if (!res.success) return fail(`Could not seed ${m.id}: ${res.error}`)
  }

  // 3. Demo shifts with fresh future UTC times.
  const shifts = []
  for (const s of DEMO_SHIFTS) {
    const poster = DEMO_MEMBERS[s.poster]
    const data = {
      title: s.title,
      startsAt: new Date(base + s.offset).toISOString(),
      endsAt: new Date(base + s.offset + s.length).toISOString(),
      notes: DEMO_NOTES,
      postedBy: poster.id,
      posterName: poster.displayName,
    }
    const res = await tools.create('shifts', data, s.id)
    if (!res.success) return fail(`Could not seed ${s.id}: ${res.error}`)
    shifts.push({ id: s.id, title: data.title, startsAt: data.startsAt, endsAt: data.endsAt, postedBy: data.postedBy })
  }

  // 4. The pending claim a reviewer-manager can approve or reject.
  const claim = await tools.create(
    'claims',
    {
      shiftId: PENDING.shiftId,
      claimantId: PENDING.claimant.id,
      claimantName: PENDING.claimant.displayName,
      createdAt: now,
    },
    PENDING.claimId,
  )
  if (!claim.success) {
    return claim.error.startsWith('Duplicate:')
      ? fail('Demo reset raced with a claim — run it again.')
      : fail(`Could not seed ${PENDING.claimId}: ${claim.error}`)
  }

  return {
    success: true,
    data: {
      members: DEMO_MEMBERS.map((m) => m.id),
      shifts,
      pendingClaim: { claimId: PENDING.claimId, shiftId: PENDING.shiftId, claimantId: PENDING.claimant.id },
      removed,
    },
  }
}

export const demoActions: Record<string, ActionHandler<Env>> = {
  /** Owner-only. Triggered from the owner-only section of the Settings page. */
  seedDemo: async ({ userId, tools, env }) => {
    if (!env.OWNER_USER_ID || userId !== env.OWNER_USER_ID) return fail('Only the app owner can seed demo data.')
    return seedDemoData(tools)
  },
}
