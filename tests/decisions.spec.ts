/**
 * Actions group 3: releaseClaim / approveClaim / rejectClaim (shared decide()).
 * Run: npx deepspace test run tests/decisions.spec.ts --secrets-config localtest
 * Race repeat (serial):
 *   npx playwright test -c tests/playwright.config.ts decisions.spec.ts \
 *     --grep concurrently --repeat-each=20 --workers=1
 *
 * Accounts (by name): "Spike A" posts (test 6 rotates poster with "Worker D"); "Worker D"/"Worker E" are workers;
 * "Manager M" becomes manager via redeemManagerInvite with the local test invite
 * test-mgr-m (tests/.invites.local.json — missing file FAILS, never skips).
 * Run with --secrets-config localtest. "Outsider" is not used.
 * Shifts start in 3s so they drop out of the post/claim caps quickly.
 */
import type { APIRequestContext } from '@playwright/test'
import { test, expect, findTestAccountByName } from 'deepspace/testing'
import { bearer, callAction, tokenSubject } from './helpers/actions'
import { loadInviteFixtures } from './helpers/invites'

const NAMES = ['Spike A', 'Worker D', 'Worker E', 'Manager M']
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
    // Real invite path (same user every run → retry path, idempotent). A
    // missing fixture file THROWS — the manager tests, incl. the race, fail loudly.
    const { code } = loadInviteFixtures()['test-mgr-m']
    const promoted = await callAction(request, token, 'redeemManagerInvite', { code })
    expect(promoted.success).toBe(true)
    expect(promoted.data.role).toBe('manager')
  }
  return { request, token, id: tokenSubject(token) }
}

const call = (a: Actor, name: string, params: object = {}) => callAction(a.request, a.token, name, params)

async function postAndClaim(poster: Actor, claimant: Actor, title: string) {
  const posted = await call(poster, 'postShift', {
    title,
    startsAt: new Date(Date.now() + 3_000).toISOString(),
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
  const [a, b] = await users(['Spike A', 'Worker D'])
  const poster = await member(a.context.request)
  const workerD = await member(b.context.request)
  const { shiftId, claimId } = await postAndClaim(poster, workerD, 'Release me')

  const res = await call(workerD, 'releaseClaim', { claimId })
  expect(res.success).toBe(true)
  expect(res.data).toMatchObject({ outcome: 'released', claimId, shiftId })

  const snap = await snapshot(workerD, shiftId)
  expect(snap.state).toBe('open')
  expect(snap.claim).toBeNull()
  expect(snap.decisions).toHaveLength(1)
  expect(snap.decisions[0]).toMatchObject({ claimId, outcome: 'released', actorId: workerD.id, claimantId: workerD.id })
})

test('2. re-claim after release works', async ({ users }) => {
  const [a, b, c] = await users(['Spike A', 'Worker D', 'Worker E'])
  const poster = await member(a.context.request)
  const workerD = await member(b.context.request)
  const workerE = await member(c.context.request)
  const { shiftId, claimId } = await postAndClaim(poster, workerD, 'Release then re-claim')
  expect((await call(workerD, 'releaseClaim', { claimId })).success).toBe(true)

  const again = await call(workerE, 'claimShift', { shiftId })
  expect(again.success).toBe(true)
  expect(again.data.claimId).not.toBe(claimId)

  const snap = await snapshot(workerE, shiftId)
  expect(snap.state).toBe('claimed')
  expect(snap.claim).toMatchObject({ claimId: again.data.claimId, claimantId: workerE.id })
  expect(snap.decisions).toHaveLength(1)
  expect(snap.decisions[0]).toMatchObject({ claimId, outcome: 'released' })
})

test('3. a worker calling approveClaim is rejected', async ({ users }) => {
  const [a, b, c] = await users(['Spike A', 'Worker D', 'Worker E'])
  const poster = await member(a.context.request)
  const workerD = await member(b.context.request)
  const workerE = await member(c.context.request)
  const { claimId } = await postAndClaim(poster, workerE, 'Worker tries to approve')

  const res = await call(workerD, 'approveClaim', { claimId })
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
  const [a, c, m] = await users(['Spike A', 'Worker E', 'Manager M'])
  const poster = await member(a.context.request)
  const workerE = await member(c.context.request)
  const manager = await member(m.context.request, { manager: true })
  const { shiftId, claimId } = await postAndClaim(poster, workerE, 'Approve me')

  const res = await call(manager, 'approveClaim', { claimId })
  expect(res.success).toBe(true)
  expect(res.data).toMatchObject({ outcome: 'approved', claimId, shiftId })

  const snap = await snapshot(workerE, shiftId)
  expect(snap.state).toBe('covered')
  expect(snap.claim).toMatchObject({ claimId, claimantId: workerE.id })
  expect(snap.decisions).toHaveLength(1)
  expect(snap.decisions[0]).toMatchObject({ claimId, outcome: 'approved', actorId: manager.id, claimantId: workerE.id })
})

test('6. release and approve fired concurrently leave exactly one decision', async ({ users }, testInfo) => {
  // Rotate poster and claimant across repeats so no one nears the post/claim
  // caps (a released shift reopens and counts toward its poster's open cap).
  const even = testInfo.repeatEachIndex % 2 === 0
  const [posterName, claimantName] = even ? ['Spike A', 'Worker D'] : ['Worker D', 'Worker E']
  const [p, w, m] = await users([posterName, claimantName, 'Manager M'])
  const poster = await member(p.context.request)
  const claimant = await member(w.context.request)
  const manager = await member(m.context.request, { manager: true })
  const { shiftId, claimId } = await postAndClaim(poster, claimant, 'Race release vs approve')

  // Random 0–30 ms head start for one side, alternating by repeat index, so
  // both orders actually occur (undelayed, release almost always wins because
  // approve does an extra team_members read before its write).
  const delayed = even ? 'release' : 'approve'
  const jitterMs = Math.floor(Math.random() * 31)
  const after = <T>(ms: number, fn: () => Promise<T>) => new Promise((r) => setTimeout(r, ms)).then(fn)
  const [release, approve] = await Promise.all([
    after(delayed === 'release' ? jitterMs : 0, () => call(claimant, 'releaseClaim', { claimId })),
    after(delayed === 'approve' ? jitterMs : 0, () => call(manager, 'approveClaim', { claimId })),
  ])
  console.log(
    `[race] repeat=${testInfo.repeatEachIndex} delayed=${delayed} jitter=${jitterMs}ms ` +
      `winner=${release.success ? 'release' : approve.success ? 'approve' : 'none'}`,
  )
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
