import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { spikeActions } from './spikes'

export const actions: Record<string, ActionHandler<Env>> = {
  ...spikeActions,
}
