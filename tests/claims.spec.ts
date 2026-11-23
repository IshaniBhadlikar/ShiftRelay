/**
 * Actions group 2: claimShift.
 * Run: npx deepspace test run tests/claims.spec.ts
 *
 * Accounts (by name): "Spike A", "Worker B", "Worker C" are members (they join
 * here). "Outsider" must NEVER join — see tests/team-and-shifts.spec.ts.
 * Test shifts start in 15s so they drop out of the post/claim caps before the
 * next run (local DO state persists across runs).
 */
import type { APIRequestContext } from '@playwright/test'
import { test, expect, findTestAccountByName } from 'deepspace/testing'
import { bearer, callAction, tokenSubject } from './helpers/actions'

const NAMES = ['Spike A', 'Worker B', 'Worker C', 'Outsider']
test.skip(
  NAMES.some((n) => !findTestAccountByName(n)),
  `Needs test accounts named ${NAMES.map((n) => `"${n}"`).join(', ')}`,
)

const HOUR = 60 * 60 * 1000

type Actor = { request: APIRequestContext; token: string; id: string }
async function actor(request: APIRequestContext, join: boolean): Promise<Actor> {
  const token = await bearer(request)
  if (join) expect((await callAction(request, token, 'joinTeam')).success).toBe(true)
  return { request, token, id: tokenSubject(token) }
}

async function postShift(poster: Actor, title: string): Promise<string> {
  const res = await callAction(poster.request, poster.token, 'postShift', {
    title,
    startsAt: new Date(Date.now() + 15_000).toISOString(),
    endsAt: new Date(Date.now() + 2 * HOUR).toISOString(),
  })
  expect(res.success).toBe(true)
  return res.data.shiftId
}

test('a claim succeeds (spoofed claimantId ignored)', async ({ users }) => {
  const [a, b] = await users(['Spike A', 'Worker B'])
  const poster = await actor(a.context.request, true)
  const claimer = await actor(b.context.request, true)
  const shiftId = await postShift(poster, 'Claim me')

  const res = await callAction(claimer.request, claimer.token, 'claimShift', { shiftId, claimantId: poster.id })
  expect(res.success).toBe(true)
  expect(res.data.claimId).toBeTruthy()
  expect(res.data.claim).toMatchObject({ shiftId, claimantId: claimer.id, claimantName: 'Worker B' })
})

test('poster claiming their own shift is rejected', async ({ users }) => {
  const [b] = await users(['Worker B'])
  const poster = await actor(b.context.request, true)
  const shiftId = await postShift(poster, 'My own shift')

  const res = await callAction(poster.request, poster.token, 'claimShift', { shiftId })
  expect(res.success).toBe(false)
  expect(res.error).toBe("You can't claim your own shift.")
})

test('two members claim concurrently: exactly one wins', async ({ users }) => {
  const [a, b, c] = await users(['Spike A', 'Worker B', 'Worker C'])
  const poster = await actor(a.context.request, true)
  const workerB = await actor(b.context.request, true)
  const workerC = await actor(c.context.request, true)
  const shiftId = await postShift(poster, 'Race me')

  const results = await Promise.all(
    [workerB, workerC].map((w) => callAction(w.request, w.token, 'claimShift', { shiftId })),
  )
  const winners = results.filter((r) => r.success)
  const losers = results.filter((r) => !r.success)
  expect(winners).toHaveLength(1)
  expect(losers).toHaveLength(1)
  expect(losers[0].error).toBe('Someone already claimed this shift.')

  const winnerId = results[0].success ? workerB.id : workerC.id
  expect(winners[0].data.claim).toMatchObject({ shiftId, claimantId: winnerId })
})

test('Outsider claim is rejected', async ({ users }) => {
  const [c, o] = await users(['Worker C', 'Outsider'])
  const poster = await actor(c.context.request, true)
  const outsider = await actor(o.context.request, false) // never joins
  const shiftId = await postShift(poster, 'Not for outsiders')

  const res = await callAction(outsider.request, outsider.token, 'claimShift', { shiftId })
  expect(res.success).toBe(false)
  expect(res.error).toBe('Join the team before claiming a shift.')
})
