/**
 * Collection Schemas
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 *
 * Add schemas by creating a file in src/schemas/ and importing it here.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { teamMembersSchema } from './schemas/team-members-schema'
import { shiftsSchema } from './schemas/shifts-schema'
import { claimsSchema } from './schemas/claims-schema'
import { decisionsSchema } from './schemas/decisions-schema'
import { inviteRedemptionsSchema } from './schemas/invite-redemptions-schema'

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  teamMembersSchema,
  shiftsSchema,
  claimsSchema,
  decisionsSchema,
  inviteRedemptionsSchema,
]
