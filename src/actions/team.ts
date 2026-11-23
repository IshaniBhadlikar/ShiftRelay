import { isAnonymousUserId } from 'deepspace/worker'
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { fail, getVerifiedProfile } from './lib'

const emailLocalPart = (email: string) => email.split('@')[0] ?? ''

export const teamActions: Record<string, ActionHandler<Env>> = {
  /**
   * Any signed-in user joins as a worker. Idempotent. `params` are ignored
   * entirely. `role` is never written (schema default 'worker' applies only on
   * insert), so a manager can't be downgraded, even by a concurrent call.
   */
  joinTeam: async ({ userId, tools, callerJwt }) => {
    if (isAnonymousUserId(userId)) return fail('Sign in to join the team.')

    const profile = await getVerifiedProfile(tools, userId, callerJwt)
    // Verified values only — never params, userId or isAdmin.
    const reg = await tools.registerUser({ name: profile.name, email: profile.email })
    if (!reg.success) return fail(`Could not register user: ${reg.error}`)

    const displayName =
      (profile.name || reg.data.user.name || emailLocalPart(profile.email || reg.data.user.email))
        .trim()
        .slice(0, 100) || 'Team member'

    const upsert = await tools.create('team_members', { displayName }, userId)
    if (!upsert.success) return fail(`Could not join team: ${upsert.error}`)

    const row = await tools.get<{ role: string; displayName: string }>('team_members', userId)
    if (!row.success) return fail(`Could not read membership: ${row.error}`)
    const { recordId, data } = row.data.record
    return { success: true, data: { userId: recordId, role: data.role, displayName: data.displayName } }
  },
}
