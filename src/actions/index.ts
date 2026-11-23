import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { teamActions } from './team'
import { shiftActions } from './shifts'
import { claimActions } from './claims'
import { decisionActions } from './decisions'
import { inviteActions } from './invites'
import { devActions } from './dev-only'

export const actions: Record<string, ActionHandler<Env>> = {
  ...teamActions,
  ...shiftActions,
  ...claimActions,
  ...decisionActions,
  ...inviteActions,
  // DEV/TEST ONLY: `vite build` replaces import.meta.env.DEV with false, so
  // dev-only actions are not in the deployed bundle. See src/actions/dev-only.ts.
  ...(import.meta.env.DEV ? devActions : {}),
}
