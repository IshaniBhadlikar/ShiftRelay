#!/usr/bin/env node
/**
 * Mint manager invite codes for ShiftRelay.
 *
 * MANAGER_INVITES (an app secret) is BASE64 of the JSON array
 * [{ id, codeHash, expiresAt }], where codeHash = lowercase hex SHA-256 of the
 * code. Base64 keeps quotes out of the secret: the CLI's .dev.vars writer
 * escapes them and dotenv keeps the backslashes, which breaks raw JSON locally.
 * One encoding everywhere → one parse path. Plaintext codes are never stored.
 *
 * Default mode — real invites; prints each code ONCE, writes nothing:
 *   node scripts/new-invite.mjs [--count 1] [--days 7] [--id-prefix inv-reviewer]
 *   → set the printed base64 value (it REPLACES the whole invite list):
 *     <paste value> | npx deepspace secrets set MANAGER_INVITES --stdin --config prd
 *
 * --test-fixtures — local test invites only (never use with --config prd):
 *   node scripts/new-invite.mjs --test-fixtures \
 *     | npx deepspace secrets set MANAGER_INVITES --stdin --config localtest
 *   Writes plaintext codes to tests/.invites.local.json (gitignored) and
 *   prints ONLY the base64 MANAGER_INVITES value on stdout.
 */
import { createHash, randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DAY_MS = 24 * 60 * 60 * 1000
const newCode = () => randomBytes(32).toString('base64url') // 43 chars, 256 bits
const sha256hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex')
const entry = (id, code, expiresAt) => ({ id, codeHash: sha256hex(code), expiresAt })
const encode = (entries) => Buffer.from(JSON.stringify(entries), 'utf8').toString('base64')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

if (process.argv.includes('--test-fixtures')) {
  const now = Date.now()
  const fixtures = {
    'test-mgr-m': { code: newCode(), expiresAt: new Date(now + 365 * DAY_MS).toISOString() },
    'test-unused': { code: newCode(), expiresAt: new Date(now + 365 * DAY_MS).toISOString() },
    'test-expired': { code: newCode(), expiresAt: new Date(now - DAY_MS).toISOString() },
  }
  const outPath = fileURLToPath(new URL('../tests/.invites.local.json', import.meta.url))
  writeFileSync(outPath, JSON.stringify(fixtures, null, 2) + '\n', { mode: 0o600 })
  console.error(`Wrote plaintext test codes to ${outPath} (gitignored). Base64 MANAGER_INVITES on stdout.`)
  process.stdout.write(encode(Object.entries(fixtures).map(([id, f]) => entry(id, f.code, f.expiresAt))))
} else {
  const days = Number(arg('--days', '7'))
  const count = Number(arg('--count', '1'))
  if (!Number.isFinite(days) || days <= 0 || !Number.isInteger(count) || count < 1 || count > 50) {
    console.error('--days must be > 0 and --count an integer 1–50')
    process.exit(1)
  }
  const prefix = arg('--id-prefix', `inv-${new Date().toISOString().slice(0, 10)}`)
  const expiresAt = new Date(Date.now() + days * DAY_MS).toISOString()
  const entries = []
  console.log('Invite codes (shown ONCE — give each to one new manager, do not store them):')
  for (let i = 0; i < count; i++) {
    const id = `${prefix}-${randomBytes(2).toString('hex')}`
    const code = newCode()
    entries.push(entry(id, code, expiresAt))
    console.log(`  ${id}: ${code}`)
  }
  console.log('')
  console.log('Entries (for your records — contains no codes):')
  console.log(`  ${JSON.stringify(entries)}`)
  console.log('')
  console.log(`Expires: ${expiresAt}`)
  console.log('')
  console.log('MANAGER_INVITES value (base64; REPLACES the whole list):')
  console.log(encode(entries))
}
