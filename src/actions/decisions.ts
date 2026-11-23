import { RECORD_NOT_FOUND } from 'deepspace/worker'
import type { ActionContext, ActionHandler, ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'
import { fail, getMember } from './lib'

type Outcome = 'approved' | 'rejected' | 'released'
const OUTCOMES: readonly string[] = ['approved', 'rejected', 'released']
type ClaimData = { shiftId: string; claimantId: string; claimantName?: string }

/**
 * Shared decision path. decisions.uniqueOn ['claimId'] makes exactly one
 * decision per claim; only the action that wins that write continues.
 * Only `claimId` is read from params; the actor is always ctx.userId.
 */
async function decide({ userId, params, tools }: ActionContext<Env>, outcome: Outcome): Promise<ActionResult> {
  if (!OUTCOMES.includes(outcome)) return fail('Invalid outcome.')
  const claimId = typeof params.claimId === 'string' ? params.claimId : ''
  if (!claimId) return fail('claimId is required.')

  const claimRes = await tools.get<ClaimData>('claims', claimId)
  if (!claimRes.success) return fail('This claim no longer exists.')
  const claim = claimRes.data.record.data

  if (outcome === 'released') {
    if (claim.claimantId !== userId) return fail('Only the claimant can release this claim.')
  } else {
    const member = await getMember(tools, userId)
    if (member?.role !== 'manager') return fail('Only managers can approve or reject claims.')
    if (claim.claimantId === userId) return fail("You can't decide your own claim.")
  }

  const created = await tools.create('decisions', {
    claimId,
    shiftId: claim.shiftId,
    outcome,
    actorId: userId,
    at: new Date().toISOString(),
    claimantId: claim.claimantId,
    claimantName: claim.claimantName ?? '',
  })
  if (!created.success) {
    return created.error.startsWith('Duplicate:')
      ? fail('This claim was already decided.')
      : fail(`Could not record decision: ${created.error}`)
  }

  // Winner only. Approve keeps the claim; reject/release delete it by recordId.
  // The decision is authoritative: a failed delete leaves a stale claim that
  // claimShift cleans up lazily, so it doesn't fail this call.
  if (outcome !== 'approved') {
    const removed = await tools.remove('claims', claimId)
    if (!removed.success && removed.error !== RECORD_NOT_FOUND) {
      console.error(`[decide] decision ${created.data.recordId} won but claim ${claimId} delete failed: ${removed.error}`)
    }
  }

  return { success: true, data: { decisionId: created.data.recordId, outcome, claimId, shiftId: claim.shiftId } }
}

export const decisionActions: Record<string, ActionHandler<Env>> = {
  releaseClaim: (ctx) => decide(ctx, 'released'),
  approveClaim: (ctx) => decide(ctx, 'approved'),
  rejectClaim: (ctx) => decide(ctx, 'rejected'),
}
