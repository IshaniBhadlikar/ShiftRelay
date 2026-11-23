/**
 * Group 4a: redeemManagerInvite.
 * Run: npx deepspace test run tests/invites.spec.ts --secrets-config localtest
 *
 * Needs local test invites (fixtures FAIL, never skip, if missing):
 *   node scripts/new-invite.mjs --test-fixtures \
 *     | npx deepspace secrets set MANAGER_INVITES --stdin --config localtest
 *
 * Accounts: "Manager M" redeems test-mgr-m; "Worker B" must stay a worker (the
 * decisions spec relies on it); "Outsider" must never join.
 * Local state persists: test-mgr-m is consumed on the first run, so later runs
 * take the same-user retry path in test 4 (the redemption kind is logged).
 */
import type { APIRequestContext } from '@playwright/test'
import { test, expect, findTestAccountByName } from 'deepspace/testing'
import { bearer, callAction } from './helpers/actions'
import { loadInviteFixtures } from './helpers/invites'

const NAMES = ['Manager M', 'Worker B', 'Outsider']
test.skip(
  NAMES.some((n) => !findTestAccountByName(n)),
  `Needs test accounts named ${NAMES.map((n) => `"${n}"`).join(', ')}`,
)

const INVALID = 'Invalid or expired invite.'

async function joined(request: APIRequestContext) {
  const token = await bearer(request)
  const join = await callAction(request, token, 'joinTeam')
  expect(join.success).toBe(true)
  return { request, token, role: join.data.role as string }
}

test('1. a non-member cannot redeem', async ({ users }) => {
  const invites = loadInviteFixtures()
  const [o] = await users(['Outsider'])
  const token = await bearer(o.context.request) // never joins
  const res = await callAction(o.context.request, token, 'redeemManagerInvite', { code: invites['test-unused'].code })
  expect(res.success).toBe(false)
  expect(res.error).toBe('Join the team before redeeming an invite.')
})

test('2. a wrong code gets the generic error', async ({ users }) => {
  loadInviteFixtures()
  const [m] = await users(['Manager M'])
  const me = await joined(m.context.request)
  const wrong = Array.from({ length: 43 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789_-'[Math.floor(Math.random() * 38)]).join('')
  const res = await callAction(me.request, me.token, 'redeemManagerInvite', { code: wrong })
  expect(res.success).toBe(false)
  expect(res.error).toBe(INVALID)
})

test('3. an expired invite gets the generic error', async ({ users }) => {
  const invites = loadInviteFixtures()
  const [m] = await users(['Manager M'])
  const me = await joined(m.context.request)
  const res = await callAction(me.request, me.token, 'redeemManagerInvite', { code: invites['test-expired'].code })
  expect(res.success).toBe(false)
  expect(res.error).toBe(INVALID)
})

test('4. a valid code makes the caller a manager', async ({ users }) => {
  const invites = loadInviteFixtures()
  const [m] = await users(['Manager M'])
  const me = await joined(m.context.request)
  const res = await callAction(me.request, me.token, 'redeemManagerInvite', { code: invites['test-mgr-m'].code })
  expect(res.success).toBe(true)
  expect(res.data.role).toBe('manager')
  console.log(`[invites] test 4 redemption path: ${res.data.redemption}`)
  expect((await joined(m.context.request)).role).toBe('manager')
})

test('5. the same user redeeming again still succeeds (retry-safe)', async ({ users }) => {
  const invites = loadInviteFixtures()
  const [m] = await users(['Manager M'])
  const me = await joined(m.context.request)
  const res = await callAction(me.request, me.token, 'redeemManagerInvite', { code: invites['test-mgr-m'].code })
  expect(res.success).toBe(true)
  expect(res.data).toEqual({ role: 'manager', redemption: 'retry' })
})

test('6. a second user with the same code is told it was already used', async ({ users }) => {
  const invites = loadInviteFixtures()
  const [b] = await users(['Worker B'])
  const workerB = await joined(b.context.request)
  const res = await callAction(workerB.request, workerB.token, 'redeemManagerInvite', { code: invites['test-mgr-m'].code })
  expect(res.success).toBe(false)
  expect(res.error).toBe('This invite has already been used.')
  expect((await joined(b.context.request)).role).toBe('worker')
})
