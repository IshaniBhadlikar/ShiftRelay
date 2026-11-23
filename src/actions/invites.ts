import { timingSafeEqualStrings } from 'deepspace/worker'
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { fail, getMember } from './lib'

type Invite = { id: string; codeHash: string; expiresAt: string }
const INVALID = 'Invalid or expired invite.'
const ROLES: readonly string[] = ['worker', 'manager']

/**
 * MANAGER_INVITES secret = base64 of JSON [{ id, codeHash, expiresAt }] (one
 * encoding in every environment — see scripts/new-invite.mjs for why base64).
 * Missing/undecodable/bad JSON fails closed ([]).
 */
function loadInvites(raw: string | undefined): Invite[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(atob(raw.trim()))
    if (!Array.isArray(parsed)) throw new Error('not an array')
    return parsed.filter(
      (e): e is Invite =>
        !!e && typeof e.id === 'string' && typeof e.codeHash === 'string' && typeof e.expiresAt === 'string',
    )
  } catch (err) {
    console.error(`[redeemManagerInvite] MANAGER_INVITES is not valid base64 JSON: ${err instanceof Error ? err.message : err}`)
    return []
  }
}

async function sha256hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const inviteActions: Record<string, ActionHandler<Env>> = {
  /**
   * Redeem a manager invite. Only `code` is read from params; the grantee is
   * always ctx.userId. invite_redemptions.uniqueOn ['inviteId'] makes each
   * invite single-use; a duplicate by the SAME user finishes the grant (retry-safe).
   */
  redeemManagerInvite: async ({ userId, params, tools, env }) => {
    if (!(await getMember(tools, userId))) return fail('Join the team before redeeming an invite.')

    const code = params.code
    if (typeof code !== 'string' || code.length < 16 || code.length > 256) return fail(INVALID)

    // Constant-time compare against EVERY invite (no early exit), so timing
    // reveals neither whether nor which entry matched.
    const hash = await sha256hex(code)
    let match: Invite | undefined
    for (const invite of loadInvites(env.MANAGER_INVITES)) {
      if (await timingSafeEqualStrings(hash, invite.codeHash.toLowerCase())) match = invite
    }
    const now = new Date().toISOString()
    if (!match) return fail(INVALID)
    const expiresMs = Date.parse(match.expiresAt)
    if (!Number.isFinite(expiresMs) || new Date(expiresMs).toISOString() <= now) return fail(INVALID)

    let redemption: 'new' | 'retry' = 'new'
    const created = await tools.create('invite_redemptions', { inviteId: match.id, userId, at: now })
    if (!created.success) {
      if (!created.error.startsWith('Duplicate:')) return fail(`Could not redeem invite: ${created.error}`)
      const existing = await tools.query<{ userId: string }>('invite_redemptions', {
        where: { inviteId: match.id },
        limit: 1,
      })
      const owner = existing.success ? existing.data.records[0]?.data.userId : undefined
      if (owner !== userId) return fail('This invite has already been used.')
      redemption = 'retry'
    }

    // Grant. The value is hard-coded, but validate it anyway.
    const ROLE = 'manager'
    if (!ROLES.includes(ROLE)) return fail('Invalid role.')
    const granted = await tools.update('team_members', userId, { role: ROLE })
    if (!granted.success) return fail(`Could not grant manager role: ${granted.error}`)
    return { success: true, data: { role: ROLE, redemption } }
  },
}
