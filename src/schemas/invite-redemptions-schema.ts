import type { CollectionSchema } from 'deepspace/schema'

const NO_WRITES = { create: false, update: false, delete: false } as const

/**
 * One redemption per manager invite (uniqueOn inviteId). Only actions read it;
 * the app owner (admin) can inspect it.
 */
export const inviteRedemptionsSchema: CollectionSchema = {
  name: 'invite_redemptions',
  columns: [
    { name: 'inviteId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'at', storage: 'text', interpretation: { kind: 'datetime' }, required: true, immutable: true },
  ],
  uniqueOn: ['inviteId'],
  permissions: {
    '*': { read: false, ...NO_WRITES },
    member: { read: false, ...NO_WRITES },
    admin: { read: true, ...NO_WRITES },
  },
}
