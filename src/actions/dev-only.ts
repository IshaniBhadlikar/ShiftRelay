/**
 * DEV/TEST-ONLY actions. Must never ship.
 *
 * Registered in ./index.ts as `...(import.meta.env.DEV ? devActions : {})`.
 * `deepspace deploy` runs `npx vite build`, which replaces import.meta.env.DEV
 * with `false`, so this module is dropped from the production bundle
 * (verified by grepping the build output — see NOTES.md). The guards below
 * are defense in depth in case that ever regresses.
 *
 * devPromoteSelfToManager was removed once redeemManagerInvite existed; tests
 * now become manager through the real invite path.
 */
import { isTestAccountEmail } from 'deepspace/worker'
import type { ActionContext, ActionHandler, ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'
import { fail, getMember, getShiftStatus, getVerifiedProfile } from './lib'
import { seedDemoData } from './demo'

async function devGuard({ userId, tools, env, callerJwt }: ActionContext<Env>): Promise<ActionResult | null> {
  if (!import.meta.env.DEV) return fail('Not available.')
  if (env.ALLOW_DEBUG_ROUTES !== 'true') return fail('Not available.')
  const { email } = await getVerifiedProfile(tools, userId, callerJwt)
  if (!isTestAccountEmail(email)) return fail('Not available.')
  return null
}

export const devActions: Record<string, ActionHandler<Env>> = {
  /**
   * Run the real seeding logic WITHOUT the owner check, for tests (the owner
   * can't be a test account). seedDemo itself keeps its owner-only check.
   */
  devSeedDemo: async (ctx) => {
    const denied = await devGuard(ctx)
    if (denied) return denied
    return seedDemoData(ctx.tools)
  },

  /** Derived state + claim + all decisions for a shift (member-only). */
  devShiftSnapshot: async (ctx) => {
    const denied = await devGuard(ctx)
    if (denied) return denied
    const { userId, params, tools } = ctx
    if (!(await getMember(tools, userId))) return fail('Join the team first.')
    const shiftId = typeof params.shiftId === 'string' ? params.shiftId : ''
    if (!shiftId) return fail('shiftId is required.')
    const status = await getShiftStatus(tools, shiftId)
    const decisions = await tools.query<{ at: string } & Record<string, unknown>>('decisions', { where: { shiftId }, limit: 100 })
    if (!decisions.success) return fail(`Could not read decisions: ${decisions.error}`)
    return {
      success: true,
      data: {
        state: status.state,
        claim: status.claim ? { claimId: status.claim.recordId, ...status.claim.data } : null,
        decisions: decisions.data.records
          .map((d) => ({ decisionId: d.recordId, ...d.data }))
          .sort((a, b) => String(a.at).localeCompare(String(b.at))),
      },
    }
  },
}
