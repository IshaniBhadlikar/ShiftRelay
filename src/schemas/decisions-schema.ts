import type { CollectionSchema } from 'deepspace/schema'

const NO_WRITES = { create: false, update: false, delete: false } as const

/**
 * Exactly one decision per claim (uniqueOn claimId) — this is what settles the
 * release-vs-approve race. claimantId/claimantName are copied from the claim
 * when the decision is written, so the audit trail survives claim deletion.
 * `outcome` options are NOT enforced by the SDK — actions validate it.
 */
export const decisionsSchema: CollectionSchema = {
  name: 'decisions',
  columns: [
    { name: 'claimId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'shiftId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'outcome', storage: 'text', interpretation: { kind: 'select', options: ['approved', 'rejected', 'released'] }, required: true, immutable: true },
    { name: 'actorId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'at', storage: 'text', interpretation: { kind: 'datetime' }, required: true, immutable: true },
    { name: 'claimantId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'claimantName', storage: 'text', interpretation: 'plain', maxLength: 100 },
  ],
  uniqueOn: ['claimId'],
  permissions: {
    '*': { read: false, ...NO_WRITES },
    member: { read: true, ...NO_WRITES },
    admin: { read: true, ...NO_WRITES },
  },
}
