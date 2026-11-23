# NOTES — build log

Use this for the submission's "what the agent did / what I verified" section.

## Pre-build design review (Nov 22)
- Started from my ShiftRelay pitch (post → claim → approve).
- Used two AI assistants (Claude, ChatGPT) to critique each other's designs.
- Checked their claims against docs.deep.space and the DeepSpace SDK source:
  - `uniqueOn` exists → used for claims/decisions/invites instead of check-then-update.
  - Actions bypass RBAC → all checks inside actions.
  - Bundled messaging is public-only → private chat cut.
  - `email/send` exists (Claude first missed it; ChatGPT corrected).
  - `setRole` grants app-wide admin → used app-owned `team_members` roles (taskspace pattern).
- Caught before coding: release-vs-approve race → `decisions` with `uniqueOn: ['claimId']`.

## Log
<!-- Date — task — what the agent did — what I changed — what I verified (and how) -->

## Spikes
- [x] a. role read via tools.get('users', userId) — failed on first run, PASS after test fix (Nov 22, run 2)
- [x] a2. upsert keyed by userId → tools.get on that key returns the row — PASS (Nov 22)
- [x] b. uniqueOn duplicate from tools.create in action — PASS (Nov 22)
- [x] c. re-claim after delete — PASS (Nov 22)

### Nov 22 — day-1 spikes
**What I did**
- Added spike-only code (delete when real actions land):
  `src/schemas/spike-schema.ts` (`spike_claims`, `uniqueOn: ['shiftId']`, all client perms false),
  `src/actions/spikes.ts` (`spikeWhoAmI`, `spikeCreateClaim`, `spikeDeleteClaim`), registered in
  `src/actions/index.ts` + `src/schemas.ts`; `tests/spikes.spec.ts`.
- Spike actions refuse unless `env.ALLOW_DEBUG_ROUTES === 'true'` (set by `deepspace dev/test` only).
- Created one test account `spike-a@deepspace.test` (label `spike`, random password via stdin,
  stored by the CLI in `~/.deepspace/test-accounts.json`).
- Ran `npx deepspace test run tests/spikes.spec.ts` locally: 1 passed, 1 failed.

**Results**
- b: second `tools.create` with the same shiftId → `{"success":false,"error":"Duplicate: a record with shiftId=… already exists in spike_claims"}`.
  Bonus: 5 concurrent creates on one key → exactly 1 success, 4 Duplicate. (SDK source: check + INSERT
  run synchronously inside the record DO, so this is atomic.)
- c: `tools.remove` → `{"success":true,"data":{"deleted":true}}`; then the same shiftId creates fine
  (SDK does a hard `DELETE FROM`).
- a: `tools.get('users', userId)` → `{"success":false,"error":"Record not found"}` both before and after
  loading `/home`.

**What the docs say about (a)**
- sdk-reference/worker/server-actions: `tools.registerUser` "Inserts or refreshes a `users` row,
  mirroring the flow that normally runs when a user's WebSocket connects. Use it in actions whose
  caller may never have opened the web app and so has no `users` row yet."
- No docs page states when the row is created on sign-in/page load. SDK source
  (`deepspace/dist/worker.js` ~L3387) confirms: the row is upserted on an *authenticated WebSocket connect*.
- Hypothesis (not yet verified): my test only waited for the nav bar, which renders before the
  socket connects (page snapshot shows no account menu yet), so the action ran before the row existed.

**Assumptions**
- The `users.role` column is the *platform* role (`viewer|member|admin`), not worker/manager —
  that stays in `team_members` per CLAUDE.md. Spike (a) only proves we can read the users row.
- Test tokens come from `POST /api/auth/token` on the signed-in context (same call as the client's `getAuthToken`).

**You should verify / decide**
- How to fix spike (a): (1) test waits for a signed-in signal (account menu / user chip) before calling,
  or (2) `joinTeam` calls `tools.registerUser` first so the row exists regardless of the socket — the
  docs' stated remedy. I'd lean (2) since `joinTeam` is the first action anyway, plus (1) in the test.
- Spike code is uncommitted, pending your review.

### Nov 22 — spikes, run 2 (your decision: do both fixes)
**What I did**
- Spike test (a) now waits for the `Account menu` button before calling the action. Kept the
  pre-page-load call as evidence.
- Added spike a2: `spike_team_members` collection (recordId = userId, role/displayName, client perms
  all false) + `spikeUpsertMember` (role fixed to 'worker' server-side, never from params) +
  `spikeDeleteMember` (caller's own row only).
- Did NOT touch `joinTeam` / `registerUser` (waiting for your OK).

**Results** — `npx deepspace test run tests/spikes.spec.ts`: 3 passed. Spike a re-run 3 more times: 3/3 pass.
- a: before page load → `Record not found`; after account menu visible → row exists,
  `result.data.record.data.role === "member"` (email/name filled from the JWT).
  Supports the hypothesis: the row is created by the signed-in session's connect, not by sign-in itself.
  Caveat: the account menu is a proxy for "WS connected", not a direct signal; 4/4 passes, but it's
  not proven race-free. The real fix is not relying on it (registerUser in joinTeam).
- a2: first `tools.create(coll, data, userId)` inserts (recordId = userId), second updates the same
  row (createdAt unchanged, updatedAt bumped); `tools.get(coll, userId)` returns it both times.

**registerUser findings** (`node_modules/deepspace/dist/worker.js` ~L2502 impl, ~L2819 tool case;
type in `worker.d.ts` ~L3529)
- Signature: `tools.registerUser({ userId?, name?, email?, imageUrl?, isAdmin? })` →
  `{ user: { id, name, email, imageUrl?, role } }`. No `role` parameter.
- Role logic: `isAdmin: true` → 'admin' (overwrites); else existing role kept; else new row gets
  'member' (hard-coded in the tool path — WS connect uses `usersSchema.defaultRole ?? 'member'`).
- It can never *downgrade* a role, but `isAdmin: true` *upgrades* to platform admin.
- `userId` defaults to the caller but accepts any id; non-empty `name`/`email`/`imageUrl` overwrite.
- Safe use in joinTeam: `tools.registerUser({})` — no params passed through, no isAdmin.

**ALLOW_DEBUG_ROUTES**
- Set only in `.dev.vars` (gitignored, rewritten by the CLI on every dev/test run). Not in
  `wrangler.toml` or any tracked config. `deepspace secrets list --only-names` (prd) → "No secrets in prd."
- Risk: it *can* be enabled in prod via `deepspace secrets set ALLOW_DEBUG_ROUTES true` (the CLI
  warns). That would also enable the spike actions → remove spike code before the real deploy.

**You should verify / decide**
- Approve `tools.registerUser({})` at the top of `joinTeam`.
- Spike code still uncommitted.

## Later (out of scope)
