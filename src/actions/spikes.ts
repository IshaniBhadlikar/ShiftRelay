/**
 * DAY-1 SPIKES — smallest actions that prove the three SDK behaviours the
 * architecture depends on. Gated on ALLOW_DEBUG_ROUTES (set only by
 * `deepspace dev` / `deepspace test`), so they refuse in production.
 * Delete this file once the real actions exist.
 */
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'

const gate = (env: Env) =>
  env.ALLOW_DEBUG_ROUTES === 'true'
    ? null
    : ({ success: false, error: 'spikes disabled' } as const)

export const spikeActions: Record<string, ActionHandler<Env>> = {
  // (a) Read the caller's role via tools.get('users', userId).
  spikeWhoAmI: async ({ userId, tools, env }) => {
    const denied = gate(env)
    if (denied) return denied
    const result = await tools.get<{ role?: string }>('users', userId)
    const role = result.success ? result.data.record.data.role : undefined
    return { success: true, data: { userId, role, raw: result } }
  },

  // (b)/(c) One create on a uniqueOn collection; returns the raw tools result.
  spikeCreateClaim: async ({ userId, params, tools, env }) => {
    const denied = gate(env)
    if (denied) return denied
    const raw = await tools.create('spike_claims', {
      shiftId: String(params.shiftId),
      claimantId: userId,
    })
    return { success: true, data: { raw } }
  },

  // (a2) Upsert the CALLER's row keyed by userId, then read it back by that key.
  // Role is fixed server-side (never from params), as joinTeam will do.
  spikeUpsertMember: async ({ userId, params, tools, env }) => {
    const denied = gate(env)
    if (denied) return denied
    const upsert = await tools.create(
      'spike_team_members',
      { role: 'worker', displayName: String(params.displayName ?? '') },
      userId,
    )
    const read = await tools.get<{ role: string; displayName: string }>('spike_team_members', userId)
    return { success: true, data: { userId, upsert, read } }
  },

  // (a2) cleanup: remove the caller's own spike member row.
  spikeDeleteMember: async ({ userId, tools, env }) => {
    const denied = gate(env)
    if (denied) return denied
    const raw = await tools.remove('spike_team_members', userId)
    return { success: true, data: { raw } }
  },

  // (c) Delete a spike claim by id; returns the raw tools result.
  spikeDeleteClaim: async ({ params, tools, env }) => {
    const denied = gate(env)
    if (denied) return denied
    const raw = await tools.remove('spike_claims', String(params.recordId))
    return { success: true, data: { raw } }
  },
}
