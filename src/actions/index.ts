import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { teamActions } from './team'
import { shiftActions } from './shifts'

export const actions: Record<string, ActionHandler<Env>> = {
  ...teamActions,
  ...shiftActions,
}
