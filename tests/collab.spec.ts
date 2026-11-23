/**
 * Multi-user collaboration spec — verifies two users sign in into
 * separate browser contexts and the app distinguishes them.
 *
 * Accounts are always requested BY NAME in this app. Any page under (app)/
 * mounts TeamProvider, which calls joinTeam for a signed-in user with no
 * team_members row — so an unnamed `users(n)` could pick "Outsider" (an account
 * other specs require to never join) and silently make it a member.
 * Pool accounts used here: "Spike A", "Worker B", "Worker C", "Manager M".
 *
 * The `users` fixture handles sign-in caching (per-account storageState
 * persisted to `~/.deepspace/playwright-states/`), context creation, and
 * cleanup. No need to manage browser contexts manually.
 */
import { test, expect, findTestAccountByName } from 'deepspace/testing'
import { bearer, callAction } from './helpers/actions'
import { loadInviteFixtures } from './helpers/invites'

// Skip (with how to fix) when this machine lacks the named accounts, rather
// than turning "no pool yet" into red tests about the app.
const BASE = ['Spike A', 'Worker B']
test.skip(
  BASE.some((n) => !findTestAccountByName(n)),
  `Needs test accounts named ${BASE.map((n) => `"${n}"`).join(', ')}. Create them with ` +
    '`npx deepspace test accounts create --email <name>@deepspace.test --name "<name>" ' +
    '--password-stdin`, or fetch existing pool accounts with `npx deepspace test accounts recover --all`.',
)

test('each browser renders its own signed-in account', async ({ users }) => {
  // Named, not users(2): see the header — /home auto-joins the team.
  const [a, b] = await users(['Spike A', 'Worker B'])

  // /home is dynamic (under src/pages/(app)/), so it mounts the nav shell;
  // '/' is the static landing and has no navigation.
  await Promise.all([a.page.goto('/home'), b.page.goto('/home')])

  // Email, not name. The page renders the *session's* `name || email`, while
  // `user.name` here comes from the LOCAL account registry — and the two are
  // not the same fact: a display name is optional, and an account recovered on
  // another machine has none stored locally at all. The email is the credential
  // the context signed in with, so it is the one identity both sides agree on,
  // and asserting it proves the page is showing THIS browser's account.
  // The two accounts are distinct, so two exact matches is also the proof that
  // the contexts are not sharing one session.
  for (const user of [a, b]) {
    await expect(user.page.getByTestId('app-navigation')).toBeVisible({ timeout: 15_000 })

    // The identity chip shows `name || email`. Its text is not predictable, but
    // its presence is: something must be there once the profile has loaded.
    // (It is `hidden sm:inline` in some templates, so assert text, not
    // visibility.)
    await expect(user.page.getByTestId('nav-user-name')).toHaveText(/\S/, { timeout: 15_000 })

    await user.page.getByRole('button', { name: 'Account menu' }).click()
    await expect(user.page.getByTestId('nav-user-email')).toHaveText(user.email, {
      timeout: 15_000,
    })
  }
})

test('API status page renders loading success and error states', async ({ users }) => {
  const [user] = await users(['Spike A'])
  let shouldFail = false
  let requestCount = 0

  await user.page.route('**/api/integrations', async (route) => {
    requestCount += 1
    if (shouldFail) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Catalog unavailable' }),
      })
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { integrations: { openai: {}, wikipedia: {} } } }),
    })
  })

  await user.page.goto('/api-status')
  await expect(user.page.getByText('Loading integration catalog...')).toBeVisible()
  await expect(user.page.getByText('Integration catalog ready')).toBeVisible()
  await expect(user.page.getByText('2 integrations available.')).toBeVisible()

  shouldFail = true
  await user.page.getByRole('button', { name: 'Refresh' }).click()
  await expect(user.page.getByText('Catalog unavailable')).toBeVisible()
  await expect(user.page.getByText('Showing the last loaded catalog')).toBeVisible()
  await expect(user.page.getByText('Integration catalog ready')).toBeVisible()

  const urlAfterFailure = user.page.url()
  const requestsAfterFailure = requestCount
  await user.page.getByRole('button', { name: 'Refresh' }).click()
  await expect.poll(() => requestCount).toBeGreaterThan(requestsAfterFailure)
  expect(user.page.url()).toBe(urlAfterFailure)
})

test('API status page shows local retry after first-load API failure', async ({ users }) => {
  const [user] = await users(['Spike A'])
  let requestCount = 0

  await user.page.route('**/api/integrations', async (route) => {
    requestCount += 1
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'Catalog unavailable' }),
    })
  })

  await user.page.goto('/api-status')
  await expect(user.page.getByText('Loading integration catalog...')).toBeVisible()
  await expect(user.page.getByText('Could not load API data')).toBeVisible()
  await expect(user.page.getByText('Retried 1 time automatically.')).toBeVisible()

  const retryButton = user.page.getByRole('button', { name: 'Retry' })
  await expect(retryButton).toBeVisible()

  const urlAfterFailure = user.page.url()
  const requestsAfterFailure = requestCount
  await retryButton.click()
  await expect.poll(() => requestCount).toBeGreaterThan(requestsAfterFailure)
  expect(user.page.url()).toBe(urlAfterFailure)
})

/**
 * Live handoff across three browsers (separate contexts, no reloads):
 * poster "Worker C" and claimant "Worker B" on the board, "Manager M" on /queue.
 * B claims in the UI → C and B both see "Claimed by Worker B"; M approves in the
 * UI → C and B both see "Covered by Worker B".
 *
 * Poster is Worker C, not Spike A: Spike A posts in most other spec files, and
 * those +5s shifts briefly count toward its 3-open-shifts cap when files run in
 * parallel. This shift starts in 30s (the claim lands ~2s after posting), so
 * it soon drops out of B's 5-claims/day soft cap; once covered it doesn't count
 * toward C's open-shift cap. Repeating this test back-to-back more than ~5
 * times within 30s WILL hit those caps (by design); the claim step then fails
 * with the server's own message, e.g. 'You've reached the limit of 5 claims per day.'
 * Manager M becomes manager through the real invite path (retry-safe).
 */
test('a claim and its approval update every board live, without reloading', async ({ users }) => {
  const NAMES = ['Worker C', 'Worker B', 'Manager M']
  test.skip(
    NAMES.some((n) => !findTestAccountByName(n)),
    `Needs test accounts named ${NAMES.map((n) => `"${n}"`).join(', ')}`,
  )
  test.setTimeout(90_000)

  const [poster, claimant, manager] = await users(NAMES)
  const tokens = await Promise.all([poster, claimant, manager].map((u) => bearer(u.context.request)))
  for (const [i, u] of [poster, claimant, manager].entries()) {
    expect((await callAction(u.context.request, tokens[i], 'joinTeam')).success).toBe(true)
  }
  const { code } = loadInviteFixtures()['test-mgr-m']
  expect((await callAction(manager.context.request, tokens[2], 'redeemManagerInvite', { code })).success).toBe(true)

  // Open all three pages and wait until each knows its team membership.
  await Promise.all([poster.page.goto('/home'), claimant.page.goto('/home'), manager.page.goto('/queue')])
  for (const u of [poster, claimant]) {
    await expect(u.page.getByRole('button', { name: 'Post a shift' })).toBeVisible({ timeout: 20_000 })
  }
  await expect(manager.page.getByRole('heading', { name: 'Recent decisions' })).toBeVisible({ timeout: 20_000 })
  // A full reload would wipe this marker; it must survive to the end.
  for (const u of [poster, claimant, manager]) {
    await u.page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true))
  }

  const title = `__test-${Date.now()}__ Live handoff`
  const posted = await callAction(poster.context.request, tokens[0], 'postShift', {
    title,
    startsAt: new Date(Date.now() + 30_000).toISOString(),
    endsAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
  })
  expect(posted.success).toBe(true)
  const shiftId: string = posted.data.shiftId

  const card = (u: { page: import('@playwright/test').Page }) =>
    u.page.locator(`[data-testid="shift-card"][data-shift-id="${shiftId}"]`)

  // The new shift appears on both boards live.
  for (const u of [poster, claimant]) {
    await expect(card(u).getByTestId('shift-state')).toHaveText('Open', { timeout: 15_000 })
  }
  await expect(card(poster).getByRole('button', { name: 'Claim' })).toHaveCount(0) // own shift

  // Worker B claims through the UI.
  await card(claimant).getByRole('button', { name: 'Claim' }).click()
  // If the server refuses, fail with ITS message (shown verbatim on the card), not just "still Open".
  await expect
    .poll(
      async () => {
        const err = card(claimant).getByTestId('shift-error')
        return (await err.count()) ? `server error: ${await err.textContent()}` : card(claimant).getByTestId('shift-state').textContent()
      },
      { timeout: 15_000 },
    )
    .toBe('Claimed by Worker B')
  for (const u of [poster, claimant]) {
    await expect(card(u).getByTestId('shift-state')).toHaveText('Claimed by Worker B', { timeout: 15_000 })
  }
  await expect(card(claimant).getByRole('button', { name: 'Release' })).toBeVisible()

  // Manager M sees it arrive in the queue live and approves through the UI.
  const item = manager.page.locator(`[data-testid="queue-item"][data-shift-id="${shiftId}"]`)
  await expect(item).toBeVisible({ timeout: 15_000 })
  await item.getByRole('button', { name: 'Approve' }).click()
  await expect(item).toHaveCount(0, { timeout: 15_000 })
  await expect(manager.page.getByTestId('queue-history')).toContainText(`You approved Worker B's claim on ${title}`)

  // Poster and claimant both see it covered; Release is gone.
  for (const u of [poster, claimant]) {
    await expect(card(u).getByTestId('shift-state')).toHaveText('Covered by Worker B', { timeout: 15_000 })
  }
  await expect(card(claimant).getByRole('button', { name: 'Release' })).toHaveCount(0)

  for (const u of [poster, claimant, manager]) {
    expect(await u.page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true)
  }
})
