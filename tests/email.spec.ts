/**
 * Email notifications (P1) — DRY RUN ONLY. Tests run on the dev build, where
 * notify() never calls email/send (import.meta.env.DEV); the winning action
 * returns `data.emails` (what it would have sent). No real email, no credits.
 * Run: npx deepspace test run tests/email.spec.ts --secrets-config localtest
 *
 * Accounts (by name): "Worker C" posts (stays off Spike A's open-shift cap);
 * "Worker B" and "Spike A" claim; "Manager M" decides (real invite path).
 * Shifts start in 5s so they leave the post/claim caps quickly.
 */
import type { APIRequestContext } from '@playwright/test'
import { test, expect, findTestAccountByName } from 'deepspace/testing'
import { bearer, callAction, tokenSubject } from './helpers/actions'
import { loadInviteFixtures } from './helpers/invites'

const NAMES = ['Worker C', 'Worker B', 'Spike A', 'Manager M']
test.skip(
  NAMES.some((n) => !findTestAccountByName(n)),
  `Needs test accounts named ${NAMES.map((n) => `"${n}"`).join(', ')}`,
)

const HOUR = 60 * 60 * 1000
const BOARD = 'https://shiftrelay.app.space/home'
type Email = { toUserId: string; to: string; subject: string; text: string }
type Actor = { request: APIRequestContext; token: string; id: string; email: string }

async function actor(u: { context: { request: APIRequestContext }; email: string }, manager = false): Promise<Actor> {
  const token = await bearer(u.context.request)
  expect((await callAction(u.context.request, token, 'joinTeam')).success).toBe(true)
  if (manager) {
    const { code } = loadInviteFixtures()['test-mgr-m']
    expect((await callAction(u.context.request, token, 'redeemManagerInvite', { code })).success).toBe(true)
  }
  return { request: u.context.request, token, id: tokenSubject(token), email: u.email }
}
const call = (a: Actor, name: string, params: object = {}) => callAction(a.request, a.token, name, params)

async function post(poster: Actor, title: string): Promise<string> {
  const res = await call(poster, 'postShift', {
    title,
    startsAt: new Date(Date.now() + 5_000).toISOString(),
    endsAt: new Date(Date.now() + 2 * HOUR).toISOString(),
  })
  expect(res.success).toBe(true)
  return res.data.shiftId
}

/** Common checks: unique recipients, never a demo id, real address for the user, readable content. */
function checkEmails(emails: Email[], title: string, accounts: Actor[]) {
  const ids = emails.map((e) => e.toUserId)
  expect(new Set(ids).size, 'one email per recipient').toBe(ids.length)
  expect(ids.some((id) => id.startsWith('demo-'))).toBe(false)
  for (const e of emails) {
    const acct = accounts.find((a) => a.id === e.toUserId)
    if (acct) expect(e.to, 'address comes from the server-side users row').toBe(acct.email)
    expect(e.subject).toContain(title)
    expect(e.text).toContain(`"${title}"`)
    expect(e.text).toMatch(/When: \w{3} \d{1,2} \w{3} \d{4}, \d{2}:\d{2}.*UTC/)
    expect(e.text).toContain(`Open the board: ${BOARD}`)
  }
}

test('claim → poster and managers, never the claimant', async ({ users }) => {
  const [c, b, m] = await users(['Worker C', 'Worker B', 'Manager M'])
  const [poster, claimant, manager] = [await actor(c), await actor(b), await actor(m, true)]
  const title = `__test-${Date.now()}__ Email on claim`
  const shiftId = await post(poster, title)

  const res = await call(claimant, 'claimShift', { shiftId, claimantId: poster.id }) // spoofed param ignored
  expect(res.success).toBe(true)
  const emails: Email[] = res.data.emails
  const ids = emails.map((e) => e.toUserId)
  expect(ids).toContain(poster.id)
  expect(ids).toContain(manager.id) // every manager is included; others may exist locally
  expect(ids).not.toContain(claimant.id)
  checkEmails(emails, title, [poster, claimant, manager])
  expect(emails.find((e) => e.toUserId === poster.id)!.text).toContain(`Worker B claimed your shift "${title}".`)
  expect(emails.find((e) => e.toUserId === manager.id)!.text).toContain(`Worker B claimed Worker C's shift "${title}".`)
})

test('approve → claimant and poster, not the deciding manager', async ({ users }) => {
  const [c, b, m] = await users(['Worker C', 'Worker B', 'Manager M'])
  const [poster, claimant, manager] = [await actor(c), await actor(b), await actor(m, true)]
  const title = `__test-${Date.now()}__ Email on approve`
  const claimed = await call(claimant, 'claimShift', { shiftId: await post(poster, title) })
  expect(claimed.success).toBe(true)

  const res = await call(manager, 'approveClaim', { claimId: claimed.data.claimId })
  expect(res.success).toBe(true)
  const emails: Email[] = res.data.emails
  expect(emails.map((e) => e.toUserId).sort()).toEqual([claimant.id, poster.id].sort())
  checkEmails(emails, title, [poster, claimant, manager])
  expect(emails.find((e) => e.toUserId === claimant.id)!.text).toContain(`Manager M approved your claim on "${title}".`)
})

test('reject → claimant and poster', async ({ users }) => {
  const [c, a, m] = await users(['Worker C', 'Spike A', 'Manager M'])
  const [poster, claimant, manager] = [await actor(c), await actor(a), await actor(m, true)]
  const title = `__test-${Date.now()}__ Email on reject`
  const claimed = await call(claimant, 'claimShift', { shiftId: await post(poster, title) })
  expect(claimed.success).toBe(true)

  const res = await call(manager, 'rejectClaim', { claimId: claimed.data.claimId })
  expect(res.success).toBe(true)
  const emails: Email[] = res.data.emails
  expect(emails.map((e) => e.toUserId).sort()).toEqual([claimant.id, poster.id].sort())
  checkEmails(emails, title, [poster, claimant, manager])
  expect(emails.find((e) => e.toUserId === poster.id)!.text).toContain(`Manager M rejected Spike A's claim on your shift "${title}".`)
})

test('release → poster only', async ({ users }) => {
  const [c, b] = await users(['Worker C', 'Worker B'])
  const [poster, claimant] = [await actor(c), await actor(b)]
  const title = `__test-${Date.now()}__ Email on release`
  const claimed = await call(claimant, 'claimShift', { shiftId: await post(poster, title) })
  expect(claimed.success).toBe(true)

  const res = await call(claimant, 'releaseClaim', { claimId: claimed.data.claimId })
  expect(res.success).toBe(true)
  const emails: Email[] = res.data.emails
  expect(emails.map((e) => e.toUserId)).toEqual([poster.id])
  checkEmails(emails, title, [poster, claimant])
  expect(emails[0].text).toContain(`Worker B released their claim on your shift "${title}".`)
})

test('races: only the winning action emails', async ({ users }) => {
  const [c, b, a, m] = await users(['Worker C', 'Worker B', 'Spike A', 'Manager M'])
  const [poster, workerB, spikeA, manager] = [await actor(c), await actor(b), await actor(a), await actor(m, true)]

  // Double claim: exactly one success, and only it carries emails.
  const shiftId = await post(poster, `__test-${Date.now()}__ Email claim race`)
  const claims = await Promise.all([call(workerB, 'claimShift', { shiftId }), call(spikeA, 'claimShift', { shiftId })])
  expect(claims.filter((r) => r.success)).toHaveLength(1)
  expect(claims.find((r) => r.success)!.data.emails.length).toBeGreaterThan(0)
  expect(claims.find((r) => !r.success)!.data).toBeUndefined()

  // Release vs approve on the winning claim: exactly one decision, only it emails.
  const winner = claims.find((r) => r.success)!
  const claimant = winner.data.claim.claimantId === workerB.id ? workerB : spikeA
  const decisions = await Promise.all([
    call(claimant, 'releaseClaim', { claimId: winner.data.claimId }),
    call(manager, 'approveClaim', { claimId: winner.data.claimId }),
  ])
  expect(decisions.filter((r) => r.success)).toHaveLength(1)
  const won = decisions.find((r) => r.success)!
  expect(won.data.emails.map((e: Email) => e.toUserId)).toContain(poster.id)
  expect(decisions.find((r) => !r.success)!.data).toBeUndefined()
})
