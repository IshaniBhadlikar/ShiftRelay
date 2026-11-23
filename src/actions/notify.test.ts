import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import { BOARD_URL, FROM, MAX_RECIPIENTS, buildEmail, formatUtcRange, notify, pickRecipients, type EmailEvent } from './notify'

const SHIFT = {
  title: 'Front desk — morning',
  startsAt: '2026-12-08T19:00:00.000Z',
  endsAt: '2026-12-08T23:00:00.000Z',
  postedBy: 'poster',
  posterName: 'Alex',
}

describe('formatUtcRange', () => {
  it('same UTC day', () => expect(formatUtcRange(SHIFT.startsAt, SHIFT.endsAt)).toBe('Tue 8 Dec 2026, 19:00–23:00 UTC'))
  it('overnight shows the end day', () =>
    expect(formatUtcRange('2026-12-08T21:00:00.000Z', '2026-12-09T05:00:00.000Z')).toBe('Tue 8 Dec 2026, 21:00 – Wed 9 Dec 05:00 UTC'))
})

describe('pickRecipients', () => {
  const ids = (o: Partial<Parameters<typeof pickRecipients>[1]>) => ({ posterId: 'poster', claimantId: 'claimant', actorId: 'claimant', managerIds: [], ...o })
  const users = (r: { userId: string }[]) => r.map((x) => x.userId)

  it('claimed → poster + managers, without the claimant (actor)', () =>
    expect(users(pickRecipients('claimed', ids({ managerIds: ['m1', 'm2'] })))).toEqual(['poster', 'm1', 'm2']))
  it('a poster who is also a manager gets one email, as poster', () =>
    expect(pickRecipients('claimed', ids({ managerIds: ['poster', 'm1'] }))).toEqual([
      { userId: 'poster', role: 'poster' },
      { userId: 'm1', role: 'manager' },
    ]))
  it('a manager who claims is left out of their own claim email', () =>
    expect(users(pickRecipients('claimed', ids({ claimantId: 'm1', actorId: 'm1', managerIds: ['m1', 'm2'] })))).toEqual(['poster', 'm2']))
  it('demo ids are skipped', () =>
    expect(users(pickRecipients('claimed', ids({ posterId: 'demo-coworker-1', managerIds: ['m1'] })))).toEqual(['m1']))
  it(`at most ${MAX_RECIPIENTS} recipients`, () =>
    expect(pickRecipients('claimed', ids({ managerIds: Array.from({ length: 20 }, (_, i) => `m${i}`) }))).toHaveLength(MAX_RECIPIENTS))
  it('approved/rejected → claimant + poster, without the deciding manager', () => {
    expect(users(pickRecipients('approved', ids({ actorId: 'm1' })))).toEqual(['claimant', 'poster'])
    expect(users(pickRecipients('rejected', ids({ actorId: 'm1' })))).toEqual(['claimant', 'poster'])
  })
  it('a manager deciding a claim on their own shift is not emailed', () =>
    expect(users(pickRecipients('approved', ids({ posterId: 'm1', actorId: 'm1' })))).toEqual(['claimant']))
  it('released → poster only', () => expect(users(pickRecipients('released', ids({})))).toEqual(['poster']))
})

describe('buildEmail', () => {
  const ev = (kind: EmailEvent['kind']): EmailEvent => ({ kind, shiftId: 's1', actorId: 'm1', actorName: 'Manager M', claimantId: 'c', claimantName: 'Sam' })
  it('claimed (poster): who acted, title, UTC date/time, link', () => {
    const { subject, text } = buildEmail({ ...ev('claimed'), actorName: 'Sam' }, SHIFT, 'poster')
    expect(subject).toBe('Claimed: Front desk — morning (Tue 8 Dec)')
    expect(text).toContain('Sam claimed your shift "Front desk — morning".')
    expect(text).toContain('When: Tue 8 Dec 2026, 19:00–23:00 UTC')
    expect(text).toContain(`Open the board: ${BOARD_URL}`)
  })
  it('approved (claimant) names the manager', () =>
    expect(buildEmail(ev('approved'), SHIFT, 'claimant').text).toContain('Manager M approved your claim on "Front desk — morning".'))
  it('rejected (poster) names manager and claimant', () =>
    expect(buildEmail(ev('rejected'), SHIFT, 'poster').text).toContain("Manager M rejected Sam's claim on your shift"))
})

/** Minimal fake of the ActionTools methods notify() uses. */
function fakeTools(over: Partial<Record<'get' | 'query' | 'integration', unknown>> = {}) {
  const emails: Record<string, string | undefined> = { poster: 'poster@example.test', m1: 'm1@example.test', claimant: 'c@example.test', noemail: undefined }
  const tools = {
    get: vi.fn(async (collection: string, id: string) => {
      if (collection === 'shifts') return { success: true, data: { recordId: id, record: { recordId: id, data: SHIFT } } }
      if (collection === 'users' && id in emails) return { success: true, data: { record: { recordId: id, data: { email: emails[id] } } } }
      return { success: false, error: 'RECORD_NOT_FOUND' }
    }),
    query: vi.fn(async () => ({ success: true, data: { records: [{ recordId: 'm1', data: {} }, { recordId: 'noemail', data: {} }, { recordId: 'ghost', data: {} }] } })),
    integration: vi.fn(async () => ({ success: true, data: {} })),
    ...over,
  }
  return tools as unknown as ActionTools & typeof tools
}
const claimed: EmailEvent = { kind: 'claimed', shiftId: 's1', actorId: 'claimant', actorName: 'Sam', claimantId: 'claimant', claimantName: 'Sam' }

describe('notify', () => {
  afterEach(() => vi.useRealTimers())

  it('dry run plans emails (server-side addresses only) and sends nothing', async () => {
    const tools = fakeTools()
    const res = await notify(tools, claimed, { dryRun: true })
    expect(res.mode).toBe('dry-run')
    expect(res.emails.map((e) => [e.toUserId, e.to])).toEqual([
      ['poster', 'poster@example.test'],
      ['m1', 'm1@example.test'],
    ]) // 'noemail' and 'ghost' (no users row) skipped
    expect(tools.integration).not.toHaveBeenCalled()
  })

  it('sends one email per recipient with the app sender', async () => {
    const tools = fakeTools()
    const res = await notify(tools, claimed, { dryRun: false })
    expect(res).toMatchObject({ mode: 'sent', failed: 0 })
    expect(tools.integration).toHaveBeenCalledTimes(2)
    expect(tools.integration).toHaveBeenCalledWith('email/send', expect.objectContaining({ from: FROM, to: 'poster@example.test' }))
  })

  it('never throws: a failed send and a throwing send are counted and logged', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const integration = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'insufficient_credits' })
      .mockRejectedValueOnce(new Error('network down'))
    const res = await notify(fakeTools({ integration }), claimed, { dryRun: false })
    expect(res.failed).toBe(2)
    expect(log).toHaveBeenCalledTimes(2)
    expect(log.mock.calls.flat().join(' ')).not.toContain('@example.test') // logs user ids, never addresses
    log.mockRestore()
  })

  it('never throws: a hanging send times out after 5 s', async () => {
    vi.useFakeTimers()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const integration = vi.fn(() => new Promise(() => {}))
    const pending = notify(fakeTools({ integration }), claimed, { dryRun: false })
    await vi.advanceTimersByTimeAsync(5_000)
    expect((await pending).failed).toBe(2)
    log.mockRestore()
  })

  it('never throws: a lookup that throws aborts quietly', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const get = vi.fn(async () => {
      throw new Error('DO unavailable')
    })
    await expect(notify(fakeTools({ get }), claimed, { dryRun: false })).resolves.toEqual({ mode: 'sent', emails: [], failed: 0 })
    log.mockRestore()
  })
})
