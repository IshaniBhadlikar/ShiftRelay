#!/usr/bin/env node
/**
 * Production bundle check — run after `npm run build` (npm run check:bundle).
 *
 * `vite build` replaces import.meta.env.DEV with false, which must strip:
 *   - the dev-only actions (src/actions/dev-only.ts),
 *   - the email dry-run forcing and the `data.emails` preview (src/actions/notify.ts,
 *     claims.ts, decisions.ts).
 * And the real email path + its production off switch must still be there.
 * Exits non-zero on any violation.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const workerPath = join(root, 'dist/shiftrelay/index.js')
const clientDir = join(root, 'dist/client/assets')
if (!existsSync(workerPath) || !existsSync(clientDir)) {
  console.error('No build found — run `npm run build` first.')
  process.exit(1)
}
const worker = readFileSync(workerPath, 'utf8')
const client = readdirSync(clientDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(join(clientDir, f), 'utf8'))
  .join('\n')

const count = (text, re) => (text.match(new RegExp(re, 'g')) ?? []).length
const rules = [
  // [label, regex, where, expected: 'absent' | 'present']
  ['dev-only action devSeedDemo', 'devSeedDemo', 'both', 'absent'],
  ['dev-only action devShiftSnapshot', 'devShiftSnapshot', 'both', 'absent'],
  ['dev-only guard devGuard', 'devGuard', 'both', 'absent'],
  ['dev-only refusal "Not available."', 'Not available\\.', 'both', 'absent'],
  ['import.meta.env.DEV left unreplaced', 'import\\.meta\\.env\\.DEV', 'both', 'absent'],
  ['email preview data.emails (mail.emails)', 'mail\\.emails', 'both', 'absent'],
  ['email code in the client bundle', 'email/send|EMAIL_DRY_RUN', 'client', 'absent'],
  ['real email/send call', 'email/send', 'worker', 'present'],
  ['EMAIL_DRY_RUN production off switch', 'EMAIL_DRY_RUN === "true"', 'worker', 'present'],
  ['owner-only seedDemo action', '\\bseedDemo\\b', 'worker', 'present'],
]

let bad = 0
for (const [label, re, where, expected] of rules) {
  const w = where === 'client' ? 0 : count(worker, re)
  const c = where === 'worker' ? 0 : count(client, re)
  const ok = expected === 'absent' ? w + c === 0 : w + c > 0
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${expected.padEnd(7)} ${label} (worker=${w}, client=${c})`)
}
// The dry-run decision must compile to the off switch alone (no DEV term).
const dryRun = worker.match(/function emailDryRun\([^)]*\)\s*\{\s*return ([^;]+);/)
const dryOk = dryRun?.[1].trim() === 'env.EMAIL_DRY_RUN === "true"'
if (!dryOk) bad++
console.log(`${dryOk ? 'ok  ' : 'FAIL'} emailDryRun compiles to: ${dryRun?.[1] ?? '(not found)'}`)

process.exit(bad ? 1 : 0)
