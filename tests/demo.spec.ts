/**
 * Group 4b: seedDemo.
 * Run: npx deepspace test run tests/demo.spec.ts --secrets-config localtest
 *
 * The owner can't be a test account, and the owner's app-scoped token is
 * rejected by resolveAuth, so the seeding logic is exercised through the
 * DEV-ONLY devSeedDemo (same seedDemoData, not in the prod bundle). The real
 * seedDemo is tested for rejecting non-owners only; the owner path is checked
 * manually (Settings → Reset demo data).
 *
 * Accounts: "Worker B" (member), "Manager M" (manager via invite; missing
 * fixture file FAILS), "Spike A" + "Worker C" for non-demo data.
 * Every test that seeds leaves fresh demo state behind (test 4 ends with a re-seed).
 */
import type { APIRequestContext } from '@playwright/test'
import { test, expect, findTestAccountByName } from 'deepspace/testing'
import { bearer, callAction, tokenSubject } from './helpers/actions'
import { loadInviteFixtures } from './helpers/invites'

const NAMES = ['Spike A', 'Worker B', 'Worker C', 'Manager M']
test.skip(
  NAMES.some((n) => !findTestAccountByName(n)),
  `Needs test accounts named ${NAMES.map((n) => `"${n}"`).join(', ')}`,
)

const HOUR = 60 * 60 * 1000
const DEMO_SHIFT_IDS = ['demo-shift-1', 'demo-shift-2', 'demo-shift-3', 'demo-shift-4']
type Actor = { request: APIRequestContext; token: string; id: string }

async function member(request: APIRequestContext, opts: { manager?: boolean } = {}): Promise<Actor> {
  const token = await bearer(request)
  expect((await callAction(request, token, 'joinTeam')).success).toBe(true)
  if (opts.manager) {
    const { code } = loadInviteFixtures()['test-mgr-m']
    const promoted = await callAction(request, token, 'redeemManagerInvite', { code })
    expect(promoted.success).toBe(true)
  }
  return { request, token, id: tokenSubject(token) }
}
const call = (a: Actor, name: string, params: object = {}) => callAction(a.request, a.token, name, params)

async function seed(a: Actor) {
  const res = await call(a, 'devSeedDemo')
  expect(res.success).toBe(true)
  return res.data
}
async function snapshot(a: Actor, shiftId: string) {
  const res = await call(a, 'devShiftSnapshot', { shiftId })
  expect(res.success).toBe(true)
  return res.data
}
/** Demo state with times stripped (times are relative to now). */
async function demoState(a: Actor) {
  const out: Record<string, unknown> = {}
  for (const id of DEMO_SHIFT_IDS) {
    const s = await snapshot(a, id)
    out[id] = { state: s.state, claim: s.claim && { ...s.claim, createdAt: undefined }, decisions: s.decisions }
  }
  return out
}
const withoutTimes = (summary: { shifts: Array<Record<string, unknown>> } & Record<string, unknown>) => ({
  ...summary,
  removed: undefined,
  shifts: summary.shifts.map(({ startsAt: _s, endsAt: _e, ...rest }) => rest),
})

function expectFreshDemo(state: Record<string, unknown>) {
  for (const id of ['demo-shift-1', 'demo-shift-2', 'demo-shift-3']) {
    expect(state[id], id).toEqual({ state: 'open', claim: null, decisions: [] })
  }
  expect(state['demo-shift-4']).toMatchObject({
    state: 'claimed',
    claim: { claimId: 'demo-claim-1', shiftId: 'demo-shift-4', claimantId: 'demo-coworker-2', claimantName: 'Demo coworker · Sam' },
    decisions: [],
  })
}

test('1. a non-owner (worker or manager) cannot seed demo data', async ({ users }) => {
  const [b, m] = await users(['Worker B', 'Manager M'])
  for (const actor of [await member(b.context.request), await member(m.context.request, { manager: true })]) {
    const res = await call(actor, 'seedDemo')
    expect(res.success).toBe(false)
    expect(res.error).toBe('Only the app owner can seed demo data.')
  }
})

test('2. seeding is idempotent', async ({ users }) => {
  const [b] = await users(['Worker B'])
  const viewer = await member(b.context.request)

  const first = await seed(viewer)
  const stateAfterFirst = await demoState(viewer)
  const second = await seed(viewer)
  const stateAfterSecond = await demoState(viewer)

  expect(withoutTimes(second)).toEqual(withoutTimes(first))
  expect(stateAfterSecond).toEqual(stateAfterFirst)
  expectFreshDemo(stateAfterSecond)
  expect(second.removed).toEqual({ claims: 1, decisions: 0 }) // only the pending demo claim existed

  const now = Date.now()
  for (const s of second.shifts) {
    expect(s.postedBy).toMatch(/^demo-coworker-/)
    expect(Date.parse(s.startsAt)).toBeGreaterThan(now + 13 * 24 * HOUR) // far future, UTC ISO
    expect(Date.parse(s.endsAt)).toBeGreaterThan(Date.parse(s.startsAt))
    expect(s.startsAt).toMatch(/Z$/)
  }
})

test('3. after seeding, a member can claim a demo shift and a manager can approve the pending demo claim', async ({ users }) => {
  const [b, m] = await users(['Worker B', 'Manager M'])
  const workerB = await member(b.context.request)
  const manager = await member(m.context.request, { manager: true })
  await seed(workerB)

  const claim = await call(workerB, 'claimShift', { shiftId: 'demo-shift-1' })
  expect(claim.success).toBe(true)
  const approve = await call(manager, 'approveClaim', { claimId: 'demo-claim-1' })
  expect(approve.success).toBe(true)
  expect((await snapshot(manager, 'demo-shift-4')).state).toBe('covered')
  // Test 4 re-seeds, restoring fresh demo state.
})

test('4. re-seeding restores the demo and leaves non-demo data untouched', async ({ users }) => {
  const [a, b, c, m] = await users(['Spike A', 'Worker B', 'Worker C', 'Manager M'])
  const poster = await member(a.context.request)
  const workerB = await member(b.context.request)
  const workerC = await member(c.context.request)
  const manager = await member(m.context.request, { manager: true })

  // Non-demo data: a real shift, claimed and approved (a real decision).
  const posted = await call(poster, 'postShift', {
    title: 'Real shift (not demo)',
    startsAt: new Date(Date.now() + 5_000).toISOString(),
    endsAt: new Date(Date.now() + 2 * HOUR).toISOString(),
  })
  expect(posted.success).toBe(true)
  const realShiftId = posted.data.shiftId
  const realClaim = await call(workerC, 'claimShift', { shiftId: realShiftId })
  expect(realClaim.success).toBe(true)
  expect((await call(manager, 'approveClaim', { claimId: realClaim.data.claimId })).success).toBe(true)
  const realBefore = await snapshot(workerC, realShiftId)
  expect(realBefore.state).toBe('covered')

  // Make sure demo state is "used": B's claim on demo-shift-1 and a decided demo-claim-1.
  await seed(workerB)
  expect((await call(workerB, 'claimShift', { shiftId: 'demo-shift-1' })).success).toBe(true)
  expect((await call(manager, 'approveClaim', { claimId: 'demo-claim-1' })).success).toBe(true)

  // Re-seed: demo restored...
  const reseed = await seed(workerB)
  expect(reseed.removed).toEqual({ claims: 2, decisions: 1 })
  expectFreshDemo(await demoState(workerB))
  // ...and the re-created demo-claim-1 can be decided again (decisions.uniqueOn handled).
  expect((await call(manager, 'approveClaim', { claimId: 'demo-claim-1' })).success).toBe(true)

  // Non-demo data untouched.
  expect(await snapshot(workerC, realShiftId)).toEqual(realBefore)
  expect((await call(workerB, 'joinTeam')).data.role).toBe('worker')
  expect((await call(manager, 'joinTeam')).data.role).toBe('manager')

  // Leave fresh demo state behind.
  expectFreshDemo((await seed(workerB), await demoState(workerB)))
})
