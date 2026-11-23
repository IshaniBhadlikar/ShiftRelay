/**
 * Actions group 3: releaseClaim / approveClaim / rejectClaim (shared decide()).
 * Run: npx deepspace test run tests/decisions.spec.ts
 * Race repeat (serial):
 *   npx playwright test -c tests/playwright.config.ts decisions.spec.ts \
 *     --grep concurrently --repeat-each=20 --workers=1
 *
 * Accounts (by name): "Spike A" posts; "Worker B"/"Worker C" are workers;
 * "Manager M" is promoted via the DEV-ONLY devPromoteSelfToManager (not in the
 * production bundle — see src/actions/dev-only.ts). "Outsider" is not used.
 * Shifts start in 5s so they drop out of the post/claim caps quickly.
 */
import type { APIRequestContext } from '@playwright/test'
import { test, expect, findTestAccountByName } from 'deepspace/testing'
import { bearer, callAction, tokenSubject } from './helpers/actions'

const NAMES = ['Spike A', 'Worker B', 'Worker C', 'Manager M']
test.skip(
  NAMES.some((n) => !findTestAccountByName(n)),
  `Needs test accounts named ${NAMES.map((n) => `"${n}"`).join(', ')}`,
)

const HOUR = 60 * 60 * 1000
type Actor = { request: APIRequestContext; token: string; id: string }

async function member(request: APIRequestContext, opts: { manager?: boolean } = {}): Promise<Actor> {
  const token = await bearer(request)
  expect((await callAction(request, token, 'joinTeam')).success).toBe(true)
  if (opts.manager) {
    const promoted = await callAction(request, token, 'devPromoteSelfToManager')
    expect(promoted.success).toBe(true)
    expect(promoted.data.role).toBe('manager')
  }
  return { request, token, id: tokenSubject(token) }
}

const call = (a: Actor, name: string, params: object = {}) => callAction(a.request, a.token, name, params)

async function postAndClaim(poster: Actor, claimant: Actor, title: string) {
  const posted = await call(poster, 'postShift', {
    title,
    startsAt: new Date(Date.now() + 5_000).toISOString(),
    endsAt: new Date(Date.now() + 2 * HOUR).toISOString(),
  })
  expect(posted.success).toBe(true)
  const claimed = await call(claimant, 'claimShift', { shiftId: posted.data.shiftId })
  expect(claimed.success).toBe(true)
  return { shiftId: posted.data.shiftId as string, claimId: claimed.data.claimId as string }
}

const snapshot = async (a: Actor, shiftId: string) => {
  const res = await call(a, 'devShiftSnapshot', { shiftId })
  expect(res.success).toBe(true)
  return res.data
}

test('1. release works and the shift reopens', async ({ users }) => {
  const [a, b] = await users(['Spike A', 'Worker B'])
  const poster = await member(a.context.request)
  const workerB = await member(b.context.request)
  const { shiftId, claimId } = await postAndClaim(poster, workerB, 'Release me')

  const res = await call(workerB, 'releaseClaim', { claimId })
  expect(res.success).toBe(true)
  expect(res.data).toMatchObject({ outcome: 'released', claimId, shiftId })

  const snap = await snapshot(workerB, shiftId)
  expect(snap.state).toBe('open')
  expect(snap.claim).toBeNull()
  expect(snap.decisions).toHaveLength(1)
  expect(snap.decisions[0]).toMatchObject({ claimId, outcome: 'released', actorId: workerB.id, claimantId: workerB.id })
})

test('2. re-claim after release works', async ({ users }) => {
  const [a, b, c] = await users(['Spike A', 'Worker B', 'Worker C'])
  const poster = await member(a.context.request)
  const workerB = await member(b.context.request)
  const workerC = await member(c.context.request)
  const { shiftId, claimId } = await postAndClaim(poster, workerB, 'Release then re-claim')
  expect((await call(workerB, 'releaseClaim', { claimId })).success).toBe(true)

  const again = await call(workerC, 'claimShift', { shiftId })
  expect(again.success).toBe(true)
  expect(again.data.claimId).not.toBe(claimId)

  const snap = await snapshot(workerC, shiftId)
  expect(snap.state).toBe('claimed')
  expect(snap.claim).toMatchObject({ claimId: again.data.claimId, claimantId: workerC.id })
  expect(snap.decisions).toHaveLength(1)
  expect(snap.decisions[0]).toMatchObject({ claimId, outcome: 'released' })
})

test('3. a worker calling approveClaim is rejected', async ({ users }) => {
  const [a, b, c] = await users(['Spike A', 'Worker B', 'Worker C'])
  const poster = await member(a.context.request)
  const workerB = await member(b.context.request)
  const workerC = await member(c.context.request)
  const { claimId } = await postAndClaim(poster, workerC, 'Worker tries to approve')

  const res = await call(workerB, 'approveClaim', { claimId })
  expect(res.success).toBe(false)
  expect(res.error).toBe('Only managers can approve or reject claims.')
})

test('4. a manager approving their own claim is rejected', async ({ users }) => {
  const [a, m] = await users(['Spike A', 'Manager M'])
  const poster = await member(a.context.request)
  const manager = await member(m.context.request, { manager: true })
  const { claimId } = await postAndClaim(poster, manager, 'Manager claims')

  const res = await call(manager, 'approveClaim', { claimId })
  expect(res.success).toBe(false)
  expect(res.error).toBe("You can't decide your own claim.")
})

test("5. a manager approves another member's claim and the shift is covered", async ({ users }) => {
  const [a, c, m] = await users(['Spike A', 'Worker C', 'Manager M'])
  const poster = await member(a.context.request)
  const workerC = await member(c.context.request)
  const manager = await member(m.context.request, { manager: true })
  const { shiftId, claimId } = await postAndClaim(poster, workerC, 'Approve me')

  const res = await call(manager, 'approveClaim', { claimId })
  expect(res.success).toBe(true)
  expect(res.data).toMatchObject({ outcome: 'approved', claimId, shiftId })

  const snap = await snapshot(workerC, shiftId)
  expect(snap.state).toBe('covered')
  expect(snap.claim).toMatchObject({ claimId, claimantId: workerC.id })
  expect(snap.decisions).toHaveLength(1)
  expect(snap.decisions[0]).toMatchObject({ claimId, outcome: 'approved', actorId: manager.id, claimantId: workerC.id })
})

test('6. release and approve fired concurrently leave exactly one decision', async ({ users }, testInfo) => {
  // Alternate claimant across repeats to stay well under the daily claim cap.
  const claimantName = testInfo.repeatEachIndex % 2 === 0 ? 'Worker B' : 'Worker C'
  const [a, w, m] = await users(['Spike A', claimantName, 'Manager M'])
  const poster = await member(a.context.request)
  const claimant = await member(w.context.request)
  const manager = await member(m.context.request, { manager: true })
  const { shiftId, claimId } = await postAndClaim(poster, claimant, 'Race release vs approve')

  const [release, approve] = await Promise.all([
    call(claimant, 'releaseClaim', { claimId }),
    call(manager, 'approveClaim', { claimId }),
  ])
  const winners = [release, approve].filter((r) => r.success)
  const losers = [release, approve].filter((r) => !r.success)
  expect(winners).toHaveLength(1)
  expect(losers).toHaveLength(1)
  expect(['This claim was already decided.', 'This claim no longer exists.']).toContain(losers[0].error)

  // Both users see the same state, with exactly one decision, matching the winner.
  const [seenByClaimant, seenByManager] = await Promise.all([snapshot(claimant, shiftId), snapshot(manager, shiftId)])
  expect(seenByManager).toEqual(seenByClaimant)
  expect(seenByClaimant.decisions).toHaveLength(1)
  if (approve.success) {
    expect(seenByClaimant.state).toBe('covered')
    expect(seenByClaimant.claim).toMatchObject({ claimId })
    expect(seenByClaimant.decisions[0]).toMatchObject({ outcome: 'approved', actorId: manager.id })
  } else {
    expect(seenByClaimant.state).toBe('open')
    expect(seenByClaimant.claim).toBeNull()
    expect(seenByClaimant.decisions[0]).toMatchObject({ outcome: 'released', actorId: claimant.id })
  }
})
