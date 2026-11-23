/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export type InviteFixtures = Record<'test-mgr-m' | 'test-unused' | 'test-expired', { code: string; expiresAt: string }>

const FIXTURE_PATH = fileURLToPath(new URL('../.invites.local.json', import.meta.url))
const HOW_TO =
  'node scripts/new-invite.mjs --test-fixtures | npx deepspace secrets set MANAGER_INVITES --stdin --config localtest ' +
  '— then run tests with --secrets-config localtest'

/**
 * Plaintext local test invite codes (gitignored). A missing or malformed file
 * is a FAILURE, never a skip — so manager-dependent tests (e.g. the decisions
 * race) cannot silently disappear.
 */
export function loadInviteFixtures(): InviteFixtures {
  if (!existsSync(FIXTURE_PATH)) {
    throw new Error(`tests/.invites.local.json is missing. Generate it with: ${HOW_TO}`)
  }
  const data = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Partial<InviteFixtures>
  for (const id of ['test-mgr-m', 'test-unused', 'test-expired'] as const) {
    if (typeof data[id]?.code !== 'string') {
      throw new Error(`tests/.invites.local.json has no code for "${id}". Regenerate it with: ${HOW_TO}`)
    }
  }
  return data as InviteFixtures
}
