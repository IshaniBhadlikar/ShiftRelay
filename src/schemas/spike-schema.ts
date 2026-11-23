import type { CollectionSchema } from 'deepspace/schema'

/**
 * DAY-1 SPIKE ONLY — mirrors the shape of `claims` (uniqueOn shiftId) so the
 * spikes exercise the same constraint the real collection will rely on.
 * Remove together with src/actions/spikes.ts and tests/spikes.spec.ts once
 * the real `claims` collection exists.
 */
export const spikeClaimsSchema: CollectionSchema = {
  name: 'spike_claims',
  columns: [
    { name: 'shiftId', storage: 'text', interpretation: 'plain' },
    { name: 'claimantId', storage: 'text', interpretation: 'plain' },
  ],
  uniqueOn: ['shiftId'],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
  },
}

/**
 * DAY-1 SPIKE ONLY — mirrors `team_members` (recordId = userId). Proves that an
 * upsert keyed by userId can be read back with tools.get(collection, userId).
 */
export const spikeTeamMembersSchema: CollectionSchema = {
  name: 'spike_team_members',
  columns: [
    { name: 'role', storage: 'text', interpretation: 'plain' },
    { name: 'displayName', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    '*': { read: false, create: false, update: false, delete: false },
  },
}
