import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { fail, getMember, getShiftState, parseUtcIso } from './lib'

const OPEN_SHIFT_CAP = 3

export const shiftActions: Record<string, ActionHandler<Env>> = {
  /**
   * Post a future shift. Caller must be a team member. postedBy/posterName come
   * from the caller, never params. Times are stored as UTC ISO strings.
   */
  postShift: async ({ userId, params, tools }) => {
    const member = await getMember(tools, userId)
    if (!member) return fail('Join the team before posting a shift.')

    const title = typeof params.title === 'string' ? params.title.trim() : ''
    if (!title || title.length > 100) return fail('title is required (1–100 characters).')

    let notes = ''
    if (params.notes !== undefined && params.notes !== null) {
      if (typeof params.notes !== 'string') return fail('notes must be text.')
      notes = params.notes.trim()
      if (notes.length > 500) return fail('notes must be at most 500 characters.')
    }

    const startsAt = parseUtcIso(params.startsAt)
    if (!startsAt) return fail('startsAt must be an ISO date-time with a timezone.')
    const endsAt = parseUtcIso(params.endsAt)
    if (!endsAt) return fail('endsAt must be an ISO date-time with a timezone.')
    if (endsAt <= startsAt) return fail('endsAt must be after startsAt.')
    const now = new Date().toISOString()
    if (startsAt <= now) return fail('startsAt must be in the future.')

    // Soft cap: open shifts by this poster that haven't started yet. Not
    // atomic — two concurrent posts can both pass (accepted, P1 soft cap).
    const mine = await tools.query<{ startsAt: string }>('shifts', { where: { postedBy: userId }, limit: 100 })
    if (!mine.success) return fail(`Could not check open shifts: ${mine.error}`)
    let open = 0
    for (const s of mine.data.records) {
      if (s.data.startsAt > now && (await getShiftState(tools, s.recordId)) === 'open') open++
    }
    if (open >= OPEN_SHIFT_CAP) return fail(`You already have ${OPEN_SHIFT_CAP} open shifts.`)

    const created = await tools.create('shifts', {
      title,
      startsAt,
      endsAt,
      notes,
      postedBy: userId,
      posterName: member.displayName || 'Team member',
    })
    if (!created.success) return fail(`Could not post shift: ${created.error}`)

    const stored = await tools.get('shifts', created.data.recordId)
    if (!stored.success) return fail(`Could not read shift: ${stored.error}`)
    return { success: true, data: { shiftId: created.data.recordId, shift: stored.data.record.data } }
  },
}
