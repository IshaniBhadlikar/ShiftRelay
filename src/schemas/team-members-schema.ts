import type { CollectionSchema } from 'deepspace/schema'

const NO_WRITES = { create: false, update: false, delete: false } as const

/**
 * One row per team member; recordId = userId. Written only by server actions
 * (joinTeam, redeemManagerInvite, seedDemo). The `select` options are NOT
 * enforced by the SDK on write — actions validate `role` themselves.
 */
export const teamMembersSchema: CollectionSchema = {
  name: 'team_members',
  columns: [
    { name: 'role', storage: 'text', interpretation: { kind: 'select', options: ['worker', 'manager'] }, required: true },
    { name: 'displayName', storage: 'text', interpretation: 'plain', maxLength: 100 },
  ],
  permissions: {
    '*': { read: false, ...NO_WRITES },
    member: { read: 'own', ...NO_WRITES },
    admin: { read: true, ...NO_WRITES },
  },
}
