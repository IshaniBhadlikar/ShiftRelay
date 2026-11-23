import type { CollectionSchema } from 'deepspace/schema'

const NO_WRITES = { create: false, update: false, delete: false } as const

/**
 * At most one claim per shift (uniqueOn shiftId — enforced atomically in the
 * record DO; see spike b). A stale claim is deleted before re-claiming (spike c).
 */
export const claimsSchema: CollectionSchema = {
  name: 'claims',
  columns: [
    { name: 'shiftId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'claimantId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'claimantName', storage: 'text', interpretation: 'plain', required: true, maxLength: 100 },
    { name: 'createdAt', storage: 'text', interpretation: { kind: 'datetime' }, required: true, immutable: true },
  ],
  uniqueOn: ['shiftId'],
  permissions: {
    '*': { read: false, ...NO_WRITES },
    member: { read: true, ...NO_WRITES },
    admin: { read: true, ...NO_WRITES },
  },
}
