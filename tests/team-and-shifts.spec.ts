/**
 * Actions group 1: joinTeam + postShift.
 * Run: npx deepspace test run tests/team-and-shifts.spec.ts
 *
 * Accounts (picked by name from the local pool):
 *   - "Spike A"  — the team member.
 *   - "Outsider" — must NEVER call joinTeam or load the app UI in any spec.
 *     It is the standing "non-member". Local DO state persists across runs,
 *     so one accidental join would invalidate these tests.
 */
import { test, expect, findTestAccountByName } from 'deepspace/testing'
import { bearer, callAction, tokenSubject } from './helpers/actions'

test.skip(
  !findTestAccountByName('Spike A') || !findTestAccountByName('Outsider'),
  'Needs test accounts named "Spike A" and "Outsider"',
)

const HOUR = 60 * 60 * 1000
/** Same instant expressed with a +05:30 offset, e.g. 2026-11-23T14:30:10.123+05:30. */
const asIst = (ms: number) => new Date(ms + 5.5 * HOUR).toISOString().replace('Z', '+05:30')
const validShift = () => ({
  title: 'Front desk',
  startsAt: new Date(Date.now() + 10_000).toISOString(),
  endsAt: new Date(Date.now() + 2 * HOUR).toISOString(),
})

test('joinTeam is idempotent and ignores params', async ({ users }) => {
  const [member, outsider] = await users(['Spike A', 'Outsider'])
  const token = await bearer(member.context.request)
  const outsiderToken = await bearer(outsider.context.request)
  const memberId = tokenSubject(token)
  const outsiderId = tokenSubject(outsiderToken)

  const first = await callAction(member.context.request, token, 'joinTeam')
  const second = await callAction(member.context.request, token, 'joinTeam')
  expect(first.success).toBe(true)
  expect(second).toEqual(first)
  expect(first.data).toEqual({ userId: memberId, role: 'worker', displayName: 'Spike A' })

  // Spoofed params must be ignored: no role escalation, no write to another user's row.
  const spoofed = await callAction(member.context.request, token, 'joinTeam', { role: 'manager', userId: outsiderId })
  expect(spoofed.success).toBe(true)
  expect(spoofed.data).toEqual({ userId: memberId, role: 'worker', displayName: 'Spike A' })

  // Proof no team_members row was created for the outsider: they still can't post.
  const outsiderPost = await callAction(outsider.context.request, outsiderToken, 'postShift', validShift())
  expect(outsiderPost.success).toBe(false)
  expect(outsiderPost.error).toMatch(/Join the team/)
})

test('postShift succeeds, normalizes times to UTC, ignores spoofed poster', async ({ users }) => {
  const [member] = await users(['Spike A'])
  const token = await bearer(member.context.request)
  const memberId = tokenSubject(token)
  await callAction(member.context.request, token, 'joinTeam')

  const startMs = Date.now() + 10_000
  const endMs = startMs + 2 * HOUR
  const res = await callAction(member.context.request, token, 'postShift', {
    title: '  Morning shift  ',
    startsAt: asIst(startMs),
    endsAt: asIst(endMs),
    notes: 'Bring keys',
    postedBy: 'someone-else',
    posterName: 'Spoof',
  })
  expect(res.success).toBe(true)
  expect(res.data.shiftId).toBeTruthy()
  expect(res.data.shift).toMatchObject({
    title: 'Morning shift',
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(endMs).toISOString(),
    notes: 'Bring keys',
    postedBy: memberId,
    posterName: 'Spike A',
  })
})

test('postShift rejects bad times', async ({ users }) => {
  const [member] = await users(['Spike A'])
  const token = await bearer(member.context.request)
  await callAction(member.context.request, token, 'joinTeam')

  const later = (h: number) => new Date(Date.now() + h * HOUR).toISOString()
  const cases: Array<[string, object, RegExp]> = [
    ['unparseable start', { startsAt: 'banana', endsAt: later(2) }, /startsAt must be an ISO date-time with a timezone/],
    ['start without timezone', { startsAt: '2030-01-01T09:00', endsAt: later(2) }, /startsAt must be an ISO date-time with a timezone/],
    ['end before start', { startsAt: later(3), endsAt: later(2) }, /endsAt must be after startsAt/],
    ['end equals start', { startsAt: later(2), endsAt: later(2) }, /endsAt must be after startsAt/],
    ['start in the past', { startsAt: later(-1), endsAt: later(1) }, /startsAt must be in the future/],
  ]
  for (const [label, times, message] of cases) {
    const res = await callAction(member.context.request, token, 'postShift', { title: 'Bad times', ...times })
    expect(res.success, label).toBe(false)
    expect(res.error, label).toMatch(message)
  }
})

test('non-member cannot post', async ({ users }) => {
  const [outsider] = await users(['Outsider'])
  const token = await bearer(outsider.context.request)
  const res = await callAction(outsider.context.request, token, 'postShift', validShift())
  expect(res.success).toBe(false)
  expect(res.error).toMatch(/Join the team before posting a shift/)
})
