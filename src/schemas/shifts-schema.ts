import type { CollectionSchema } from 'deepspace/schema'

const NO_WRITES = { create: false, update: false, delete: false } as const

/**
 * A posted shift. State (open/claimed/covered) is DERIVED from claims +
 * decisions, never stored. Datetimes are UTC ISO strings (toISOString()).
 */
export const shiftsSchema: CollectionSchema = {
  name: 'shifts',
  columns: [
    { name: 'title', storage: 'text', interpretation: 'plain', required: true, maxLength: 100 },
    { name: 'startsAt', storage: 'text', interpretation: { kind: 'datetime' }, required: true },
    { name: 'endsAt', storage: 'text', interpretation: { kind: 'datetime' }, required: true },
    { name: 'notes', storage: 'text', interpretation: 'plain', maxLength: 500 },
    { name: 'postedBy', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'posterName', storage: 'text', interpretation: 'plain', required: true, maxLength: 100 },
  ],
  permissions: {
    '*': { read: false, ...NO_WRITES },
    member: { read: true, ...NO_WRITES },
    admin: { read: true, ...NO_WRITES },
  },
}
