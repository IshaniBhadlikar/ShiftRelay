/**
 * DAY-1 SPIKES (CLAUDE.md a/b/c). Each test logs the raw action response.
 * Run: npx deepspace test run tests/spikes.spec.ts
 * Needs 1 test account: npx deepspace test accounts create --email <x>@deepspace.test --password-stdin
 */
import type { APIRequestContext } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 1, 'Needs 1 usable test account')

async function bearer(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/auth/token', { headers: { 'Content-Type': 'application/json' } })
  expect(res.ok(), `token status ${res.status()}`).toBeTruthy()
  const { token } = (await res.json()) as { token?: string }
  expect(token).toBeTruthy()
  return token!
}

async function call(request: APIRequestContext, token: string, name: string, params: object = {}) {
  const res = await request.post(`/api/actions/${name}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: params,
  })
  const body = await res.json()
  console.log(`[${name}] HTTP ${res.status()} ${JSON.stringify(body)}`)
  expect(res.status()).toBe(200)
  return body
}

test('spike a: caller role via tools.get(users, userId) → result.data.record.data.role', async ({ users }) => {
  const [u] = await users(1)
  const token = await bearer(u.context.request)

  // Informational: does a users row exist before the app has ever been opened?
  await call(u.context.request, token, 'spikeWhoAmI')

  await u.page.goto('/home')
  await expect(u.page.getByTestId('app-navigation')).toBeVisible({ timeout: 15_000 })
  // The users row is upserted on the authenticated WebSocket connect; the
  // account menu renders only once the signed-in session has booted.
  await expect(u.page.getByRole('button', { name: 'Account menu' })).toBeVisible({ timeout: 15_000 })

  const body = await call(u.context.request, token, 'spikeWhoAmI')
  expect(body.success).toBe(true)
  expect(body.data.raw.success).toBe(true)
  expect(body.data.raw.data.record.recordId).toBe(body.data.userId)
  expect(['viewer', 'member', 'admin']).toContain(body.data.role)
})

test('spike a2: upsert keyed by userId → tools.get(collection, userId) returns the row', async ({ users }) => {
  const [u] = await users(1)
  const req = u.context.request
  const token = await bearer(req)

  try {
    // First upsert inserts; second upsert on the same key updates (no duplicate row).
    for (const displayName of ['Spike first', 'Spike second']) {
      const body = await call(req, token, 'spikeUpsertMember', { displayName })
      expect(body.data.upsert.success).toBe(true)
      expect(body.data.upsert.data.recordId).toBe(body.data.userId)
      expect(body.data.read.success).toBe(true)
      expect(body.data.read.data.record.recordId).toBe(body.data.userId)
      expect(body.data.read.data.record.data).toMatchObject({ role: 'worker', displayName })
    }
  } finally {
    await call(req, token, 'spikeDeleteMember')
  }
})

test('spike b + c: uniqueOn duplicate → success:false; delete frees the key', async ({ users }) => {
  const [u] = await users(1)
  const req = u.context.request
  const token = await bearer(req)
  const shiftId = `spike-${Date.now()}`
  const created: string[] = []

  try {
    // b1: sequential duplicate
    const first = await call(req, token, 'spikeCreateClaim', { shiftId })
    expect(first.data.raw.success).toBe(true)
    created.push(first.data.raw.data.recordId)

    const dup = await call(req, token, 'spikeCreateClaim', { shiftId })
    expect(dup.data.raw.success).toBe(false)
    expect(dup.data.raw.error).toMatch(/^Duplicate:/)

    // b2: concurrent creates on a fresh key → exactly one wins
    const raceKey = `${shiftId}-race`
    const race = await Promise.all(
      Array.from({ length: 5 }, () => call(req, token, 'spikeCreateClaim', { shiftId: raceKey })),
    )
    const winners = race.filter((r) => r.data.raw.success)
    expect(winners).toHaveLength(1)
    created.push(winners[0].data.raw.data.recordId)

    // c: delete the original claim, then the same shiftId can be claimed again
    const del = await call(req, token, 'spikeDeleteClaim', { recordId: created.shift() })
    expect(del.data.raw.success).toBe(true)

    const again = await call(req, token, 'spikeCreateClaim', { shiftId })
    expect(again.data.raw.success).toBe(true)
    created.push(again.data.raw.data.recordId)
  } finally {
    for (const recordId of created) await call(req, token, 'spikeDeleteClaim', { recordId })
  }
})
