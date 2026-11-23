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

### Nov 22 — spike code removed
- Spike actions, schemas and test deleted; results kept above. Full spike code is retrievable at
  commit `2d7e652` (`git show 2d7e652`). `src/actions/index.ts` and `src/schemas.ts` restored to scaffold.
- ALLOW_DEBUG_ROUTES prod risk from the spikes is gone with this commit.
- Test account `spike-a@deepspace.test` still exists in the local pool (reusable for real tests).

**Decision (approved Nov 22) — joinTeam:**
- First step: `tools.registerUser({ name, email })` with name/email taken ONLY from the verified JWT
  profile (getVerifiedProfile pattern from the taskspace example, or decode `ctx.callerJwt` the same way).
- Never pass `params`, `userId`, or `isAdmin` to registerUser.
- `team_members.displayName` = that same verified name.

### Nov 22 — collection schemas
**What I did**
- Added `team_members`, `shifts`, `claims`, `decisions`, `invite_redemptions` (one file each in
  `src/schemas/`, registered in `src/schemas.ts`), exactly as in the approved plan.
- Every collection: `create/update/delete: false` for `'*'`, `member`, `admin`. Blocks are spelled out
  per role because an exact role key REPLACES `'*'` (SDK `getRolePermissions`, worker.js:612).
- Reads: anonymous (`viewer` → `'*'`) nothing; `member` reads shifts/claims/decisions, and only its own
  `team_members` row; `admin` reads all; `invite_redemptions` admin-only.
- `decisions` carries `claimantId` (required, immutable) + `claimantName`, copied from the claim when the
  decision is written, so the audit trail survives claim deletion.
- `immutable` on ids/links/outcome/timestamps; no `userBound` (it would break seedDemo's demo ids).

**Assumptions / rules for the actions**
- All datetimes stored as UTC via `new Date(x).toISOString()`; the schema can't enforce it.
- `select` options (`role`, `outcome`) are NOT enforced by the SDK on write; actions must validate.
- `required` / `maxLength` / `immutable` ARE enforced on action writes (second line of defense).

**Verified**
- `npx tsc --noEmit` clean. `npx deepspace test run` (smoke + api): 8 passed, no schema errors in the
  worker log (the WebSocket test boots the record DO with the new schemas).
- NOT yet verified: that a client write is actually refused. No UI write path exists; deferred to test 3 (authz).

### Nov 22 — actions group 1: joinTeam + postShift
**What I did**
- `src/actions/lib.ts` (getVerifiedProfile — pasted taskspace code, getMember, parseUtcIso,
  getShiftState, fail), `src/actions/team.ts` (joinTeam), `src/actions/shifts.ts` (postShift),
  registered in `src/actions/index.ts`.
- Schema change (approved): `team_members.role` gets `default: 'worker'`. joinTeam never sends `role`
  — the default applies only on insert (SDK `worker.js` ~L1539) and upsert merges `{...existing, ...data}`
  (~L1536), so a manager can't be downgraded, even by a concurrent joinTeam/redeemManagerInvite.
- `tests/helpers/actions.ts` (bearer, tokenSubject, callAction) + `tests/team-and-shifts.spec.ts`.
- New test account **"Outsider"** (`outsider-4cbb3b@deepspace.test`; `outsider@` was taken — test emails
  are global). **Rule: Outsider must never call joinTeam or load the app UI** — local DO state persists
  across runs, so one join would break the non-member tests permanently.

**callerJwt is verified before the action runs** (same `Authorization: Bearer` header both times):
- `src/server/action-routes.ts:46` — `resolveAuth(c.req.raw, c.env)`; 401 if null.
- `src/server/http-routes.ts:40-43` — `resolveAuth` takes the Bearer token → `verifyJwt(jwtConfig(env), token)`.
- `node_modules/deepspace/dist/worker.js:6362` — `verifyJwt` → `jwtVerify(token, publicKey, { issuer })`
  (signature, issuer, exp); `userId = claims.sub` (L6385).
- `src/server/action-routes.ts:53-54` — `callerJwt` sliced from the same header; L67 passes it with
  `userId: auth.userId`. So decoded claims are verified and `sub === ctx.userId`.
- Caveat: the guarantee lives in app-owned scaffold code; if `resolveAuth` ever accepts cookie sessions,
  `callerJwt` could differ from the verified identity.

**Assumptions**
- Soft cap counts only open shifts that **haven't started** (a started shift can't be claimed; with no
  cancel, past unclaimed shifts would otherwise block a poster forever).
- Times must carry an explicit `Z`/`±hh:mm`; offset-less strings are rejected (worker would read them as UTC).
- `getVerifiedProfile`'s email fallback (users row) is the stored value, so passing it to registerUser is a no-op.
- displayName: JWT name → users-row name → email local part → "Team member"; truncated to 100.

**Verified** — `npx deepspace test run tests/team-and-shifts.spec.ts`: 4 passed (run twice).
- join idempotent (3 identical results, incl. spoofed `{role:'manager', userId:<Outsider>}`); Outsider
  still refused afterwards → no row was written for them.
- post: `+05:30` input stored as same instant in `Z`; spoofed `postedBy`/`posterName` ignored; title trimmed.
- bad times: unparseable, no timezone, end<start, end=start, start in past — each its own message.
- non-member can't post.
- NOT tested yet: manager-not-downgraded (needs redeemManagerInvite), soft cap (P1).

**You should verify**
- Nothing committed yet — awaiting your review.

### Nov 22 — actions group 2: claimShift
**What I did**
- `src/actions/claims.ts` (claimShift), registered in `src/actions/index.ts`.
- `src/actions/lib.ts`: `getShiftStatus` returns `{ state, claim?, decision? }`; `getShiftState` now
  wraps it (postShift unchanged).
- `tests/claims.spec.ts`. New test accounts **"Worker B"** (`worker-b-90595b@deepspace.test`) and
  **"Worker C"** (`worker-c-f1f989@deepspace.test`); members, join inside tests. Test 3 needs three
  members (poster + two claimers).

**Decisions / assumptions**
- Daily claim cap (your definition): claim attempts in the last 24h on shifts that haven't started =
  current claims (createdAt ≥ now−24h) + rejected/released decisions with claimantId = caller
  (at ≥ now−24h), deduped by claimId, filtered to shifts with startsAt > now. Cap 5. Not atomic.
- Stale claim (rejected/released decision) is deleted **by its recordId only**, never by shiftId, so a slow
  caller can't delete a fresh claim another user just created. Not-found on delete is ignored.
- "claimed" state and the uniqueOn `Duplicate:` ack both return "Someone already claimed this shift."
- Only `shiftId` is read from params; claimantId/claimantName come from ctx.userId / team_members.

**Verified** — `npx deepspace test run tests/claims.spec.ts`: 4 passed.
- claim succeeds; spoofed `claimantId` ignored. Own-shift claim rejected. Outsider rejected.
- Concurrent B+C claim: exactly one success (C won this run), the other "Someone already claimed this shift."
  Note: the output can't show whether the loser hit the pre-check or the uniqueOn duplicate path — both
  return the same message by design; atomicity itself was proven in spike b.

**NOT tested yet**
- Stale-claim cleanup + re-claim after reject/release (needs group 3 actions).
- Claim cap (P1).

**Repeat run of test 3 (Nov 23)** — `deepspace test run` has no `--repeat-each`, so ran Playwright directly
(skips the CLI's dev-secrets refresh; `.dev.vars` was fresh):
- `npx playwright test -c tests/playwright.config.ts claims.spec.ts --grep concurrently --repeat-each=20`
  → **9/20 passed** (Playwright used 5 parallel workers).
- Same with `--workers=1` → **18/20 passed**.
- **Every failure was a soft cap, none was a race failure.** Across both runs: 0 shifts with two successful
  claims (checked every successful claim's shiftId for duplicates). Failures were:
  - `You've reached the limit of 5 claims per day.` — 20 repeats in ~13–39 s; each claim counts until its
    shift starts (now+15s), so Worker B/C exceed 5 counted claims.
  - Parallel run only: cascade to `You already have 3 open shifts.` for Spike A (capped claims leave the
    posted shifts open, and they count until they start).
- Hypothesis confirmed by the numbers: fewer concurrent repeats (serial) → fewer cap hits (11 → 2).
- **Fix applied (approved Nov 23):** `tests/claims.spec.ts` shifts start at now+5s (was now+15s); repeat
  checks run with `--workers=1` (command in the spec header). No assertion changes.
- **Result:** `--repeat-each=20 --workers=1` → **20/20 passed**; 20 successful claims on 20 distinct
  shifts, 0 double wins, 0 cap errors. Full `tests/claims.spec.ts` via `deepspace test run`: 4/4 passed.

### Nov 23 — actions group 3: releaseClaim / approveClaim / rejectClaim
**What I did**
- `src/actions/decisions.ts`: shared `decide()` + three actions. Only `claimId` read from params; outcome
  validated; claim re-read ("This claim no longer exists."); release = claimant only; approve/reject =
  manager and not the claimant; decision copies claimantId/claimantName; `Duplicate:` → "This claim was
  already decided."; winner-only delete for reject/release (by claimId, RECORD_NOT_FOUND ignored, other
  errors logged — decision stands).
- `src/actions/dev-only.ts` (`devPromoteSelfToManager`, `devShiftSnapshot`), registered only as
  `...(import.meta.env.DEV ? devActions : {})`. Guards inside: DEV, ALLOW_DEBUG_ROUTES, verified test-account email.
- `tests/decisions.spec.ts`. New test account **"Manager M"** (`manager-m-8fcd8e@deepspace.test`),
  promoted via the dev-only action.

**Why the dev-only promotion can't work in production (verified)**
- `deepspace deploy` runs `npx vite build` (cli.js ~L7209) and ships the bundle named by
  `.wrangler/deploy/config.json` → `dist/shiftrelay/wrangler.json` → `main: index.js` (cli.js ~L7234-7239).
- Grepped **`dist/shiftrelay/index.js`** after `npx vite build`:
  - positive control `claimShift` → FOUND (also releaseClaim/approveClaim/rejectClaim, 1 each)
  - `devPromoteSelfToManager` → NOT found; `devShiftSnapshot` → NOT found; dev-only string "Not available." → 0
- So the code is not in the deployed bundle. The in-handler guards are defense in depth only.

**Verified**
- `npx deepspace test run tests/decisions.spec.ts`: **6/6 passed.**
- Bonus: Manager M's `joinTeam` returned `role: "manager"` after promotion → joinTeam doesn't downgrade
  (first live evidence; previously only argued from the `default` semantics).
- Race repeat `--grep concurrently --repeat-each=20 --workers=1`: **18/20 passed.**
  - 2 failures: `postShift` → "You already have 3 open shifts." (Spike A). Release won every race, so each
    shift reopened and counted toward Spike A's cap until it started (5 s). Not a race failure.
  - **Release won 18/18; approve won 0.** Every loser was approve → "This claim was already decided."
    Hypothesis: approve does an extra `team_members` read before its write, so release reaches the
    decision write first almost every time. The "approve wins the race" branch was never exercised.
  - 0 runs with ≠1 decision; claimant and manager snapshots were equal in every passing run.

**NOT tested**
- claimShift's stale-cleanup branch (needs a decision whose claim delete failed — fault injection).

**Test 6 fix (approved Nov 23, test-only — no production code changed)**
- Poster/claimant rotate by repeat index: even → Spike A posts, Worker B claims; odd → Worker B posts,
  Worker C claims.
- One side gets a random 0–30 ms head-start delay, alternating by repeat index (even: release delayed;
  odd: approve delayed). Each run logs `[race] repeat=… delayed=… jitter=… winner=…`.
- Re-run `--grep concurrently --repeat-each=20 --workers=1`: **20/20 passed. Approve won 9, release won 11.**
  Loser messages: approve → "This claim no longer exists." ×7 / "This claim was already decided." ×4;
  release → "This claim was already decided." ×9. No post/claim cap errors. Full spec: 6/6 passed.
- Observation: approve won every run where release was delayed (even with 5 ms jitter; lost only at 1 ms),
  consistent with the "extra team_members read" hypothesis.

### Nov 23 — group 4a: redeemManagerInvite
**What I did (uncommitted, awaiting review)**
- `scripts/new-invite.mjs`: default mode prints each code ONCE + the entries + the base64 MANAGER_INVITES value,
  writes nothing (verified: git status unchanged). `--test-fixtures`: 3 local test invites → plaintext in
  `tests/.invites.local.json` (gitignored, `git check-ignore` verified), base64 value on stdout.
- **MANAGER_INVITES format = base64 of JSON `[{ id, codeHash, expiresAt }]`** in every environment (one parse
  path). Reason: first attempt with raw JSON failed locally — the CLI writes `.dev.vars` as
  `MANAGER_INVITES="[{\"id\":...}]"` and wrangler's dotenv (16.3.1) keeps the backslashes →
  `JSON.parse` error at position 2 (reproduced with `dotenv.parse`). The action failed closed, as designed.
- Secrets config **`localtest`** holds the test invites; package.json test scripts pass `--secrets-config localtest`.
- `src/actions/invites.ts` (redeemManagerInvite): member check first; code 16–256 chars; SHA-256 → compared
  against EVERY invite with `timingSafeEqualStrings` (no early exit); unknown/expired → same generic error;
  `invite_redemptions` create; Duplicate → same user = retry grant, else "already used"; role validated, then granted.
- `tests/helpers/invites.ts`: a missing/malformed fixture file THROWS (never skips) — incl. the decisions spec.
- Decisions spec switched to the invite path; **`devPromoteSelfToManager` deleted** (`devShiftSnapshot` kept).

**Why localtest is never deployed**
- `dev start` / `test run` materialize one secrets config into `.dev.vars` (`--secrets-config`, default `prd`;
  `cli.js` ~L4741, `writeDevVars` ~L3507). `.dev.vars` is gitignored.
- `deploy` has no config flag: `loadDeploySecrets` uses `envName ?? 'prd'` (`cli.js:8530`); no `[env.*]` in
  wrangler.toml → only `prd` is ever deployed. `prd` currently does not exist.

**Verified**
- `tests/invites.spec.ts --secrets-config localtest`: **6/6** — test 4 took the **new** redemption path.
- `tests/decisions.spec.ts --secrets-config localtest`: **6/6** before and **6/6** after deleting the promote action
  (manager setup took the retry path each time).
- Build grep, `npx vite build` → `dist/shiftrelay/index.js` (deploy target per `.wrangler/deploy/config.json`):
  claimShift 1, redeemManagerInvite 3 (FOUND); devPromoteSelfToManager 0, devShiftSnapshot 0, "Not available." 0.

**Correction to my plan**
- I said re-running `--test-fixtures` would re-exercise the fresh-redemption path. It won't: fixture invite ids
  are fixed (`test-mgr-m`), and Manager M already redeemed that id, so a regenerated code with the same id takes
  the retry path. Fix if wanted: suffix fixture ids per generation (e.g. `test-mgr-m-<rand>`).

### Nov 23 — group 4b: seedDemo
**What I did**
- `src/actions/demo.ts`: `seedDemoData(tools, now)` + owner-only `seedDemo` (`ctx.userId === env.OWNER_USER_ID`).
  Fixed ids: team_members `demo-coworker-1..3` ("Demo coworker · Alex/Sam/Priya", worker); shifts
  `demo-shift-1..4` (notes "Demo data — safe to claim."); pending claim `demo-claim-1` (Sam on demo-shift-4).
  Times UTC, base = next whole hour: +14d (4h), +15d (4h, pending claim), +18d (6h), +21d (8h).
- Re-seed: for each demo shift id, `deleteWhere('decisions', {shiftId})` then `deleteWhere('claims', {shiftId})`,
  then upsert members/shifts with fixed ids and re-create `demo-claim-1`. Deleting the demo decisions is what
  lets the re-created `demo-claim-1` be decided again under `decisions.uniqueOn`. Reviewers' claims/decisions ON
  demo shifts are removed too (demo state); nothing else is touched.
- Owner trigger: owner-only "Demo data" section on Settings (rendered when `user.role === 'admin'`; server
  enforces OWNER_USER_ID) → "Reset demo data" → `seedDemo`. New client helper `src/lib/actions.ts`.
- Dev-only `devSeedDemo` (same `seedDemoData`, `devGuard`) for tests.

**Why the owner path isn't automated**
- Test accounts can't be the owner, and `APP_OWNER_JWT` (`scope: app:<id>`) is rejected by `verifyJwt`
  (`worker.js:6371`) because the app's `jwtConfig` sets no `acceptScope` (`src/server/http-routes.ts:35-37`).
  The owner-success line of `seedDemo` is checked manually (see Later).

**Verified**
- `tests/demo.spec.ts --secrets-config localtest`: **4/4** (non-owner worker+manager rejected; idempotent incl.
  `removed {claims:1, decisions:0}` on the 2nd seed; member claims demo shift + manager approves demo-claim-1;
  re-seed restores, demo-claim-1 approvable again, real shift/decision and real roles untouched).
- Full suite `npx deepspace test run all --secrets-config localtest`: **35/35 Playwright + 3/3 unit**.
- Build grep on `dist/shiftrelay/index.js` (first run): `devSeedDemo` was found once — a JSDoc comment in
  demo.ts naming the dev-only action (the bundle keeps comments). Fix: reworded the comment; rule: production-
  bundled files never name dev-only actions.
- Build grep after the fix — FOUND: `\bseedDemo\b` 3, claimShift 1, redeemManagerInvite 3. ABSENT (strict
  bare names): devSeedDemo 0, devShiftSnapshot 0, devPromoteSelfToManager 0. ABSENT (extra code patterns):
  `devSeedDemo\s*:` 0, `devShiftSnapshot\s*:` 0, `devPromoteSelfToManager\s*:` 0, devGuard 0, devActions 0,
  "Not available." 0.
- Settings UI: tsc + lint only; not exercised (owner can't sign in to tests).
- Claim-cap note: demo shifts start 14+ days out, so a test claim on demo-shift-1 counts toward that worker's
  24h claim cap until a re-seed deletes it; test 4 ends with a re-seed.

### Nov 23 — UI: board, post, activity, queue, settings, landing
**What I did**
- `npm test` now runs `deepspace test run all --secrets-config localtest` (every spec + unit).
- `src/lib/shift-state.ts`: the ONE pure `deriveShiftState(hasClaim, outcome)` + `buildBoard()`. Server
  `getShiftStatus` (src/actions/lib.ts) and the client board both use it. Unit tests: `shift-state.test.ts`.
- Design (docs.deep.space Design section): own `relay` theme (warm paper, graphite, deep-green "stamp" accent,
  ochre for Claimed; tokens only, no colors in JSX), IBM Plex Sans + Plex Mono (times only). Design Direction
  block in `src/pages/index.tsx`; `home pattern:` line in home.tsx. Anti-AI grep gate + product-polish gate clean
  (only hit: "React #310" in a scaffold comment).
- `TeamProvider` (src/lib/team.tsx): reads the caller's `team_members` row live; if missing, calls `joinTeam`
  once per user id. Nav shows Queue only to managers (cosmetic).
- Pages: Board `/home` (live, grouped by day, Claim/Release, demo tag, faded in-progress), Post `/post` (inline
  validation, local datetime → `toISOString()`, live preview), My activity `/activity`, Queue `/queue` (managers;
  Approve / Reject with confirm; hidden on own claim; last 10 decisions), Settings (invite-code box, team role),
  Landing `/` (pitch + static three-station slip mockup; fixed time labels so the prerender matches every zone).
- All writes via `src/lib/actions.ts` → existing actions. Errors shown verbatim; buttons disabled in flight.
- Tests: `collab.spec.ts` three-browser live test (Worker C posts, Worker B claims in the UI, Manager M approves on
  /queue in the UI; C and B see "Claimed by Worker B" then "Covered by Worker B"; a window marker proves no
  reloads). `smoke.spec.ts`: landing shows the real headline, no template copy.

**Assumptions**
- `'own'` read of team_members works for action-created rows: SDK stamps `_created_by` with the action caller
  (src/server/action-routes.ts sends X-User-Id = ctx.userId). Confirmed in a browser before building on it.
- Board = shifts that haven't ENDED (in-progress ones stay, faded, without Claim).
- Decision actor names come from `useUsers()` (public roster: id + name); no schema change.
- Live test poster is Worker C (not Spike A, as planned): Spike A posts in most specs and could briefly hit its
  3-open-shifts cap when files run in parallel. Test shift starts in 30s to leave the claim cap quickly.

**Incident (local data only) — fixed**
- First full run: 4 Outsider tests failed. Cause: the scaffold collab test used `users(2)`, which picks the two
  OLDEST pool accounts (Spike A, Outsider), opened `/home`, and the new auto-join made Outsider a member; a later
  invites test then let Outsider redeem `test-unused` and become manager.
- Fix: every collab test now requests accounts by name (header explains why). Local repair via the dev server's
  local explorer SQL (not code): deleted exactly Outsider's `c_team_members` row and the `test-unused`
  `c_invite_redemptions` row (by row id, after SELECTing them). Rerun: 0 Outsider joinTeam calls.

**Verified**
- Full suite `npm test -- --port 5180`: **37/37 Playwright + 10/10 unit**. Live test `--repeat-each=3`: 3/3.
- Running the live test back-to-back 8 times hits Worker B's 5-claims/day soft cap (by design) — the test then
  fails with the server's own message ("You've reached the limit of 5 claims per day."), not a silent "Open".
- `vite build`: prerender OK; dev-only names absent from worker and client bundles.
- Screenshot review (temporary spec, not committed) caught: landing slips too narrow (title wrapped mid-word) →
  `stacked` slip layout; My activity listed long-ended test claims tagged "In progress" → activity shows only
  unfinished shifts (history is in Decisions) and past shifts get an "Ended" tag. Suite rerun: 37/37 + 10/10.

**What you should verify**
- Click through post → activity → queue → settings → landing on localhost (owner account; redeem a local invite
  to see the queue as manager).
- If you ever run specs with unnamed `users(n)` again, Outsider can be auto-joined — keep accounts named.

### Nov 23 — /post, /activity, /queue 404 on the running dev server (DEV-ONLY, no code change)
**Cause (confirmed: a private window showed /queue):** a stale cached route list in my browser. Not the route
scan — the server log shows generouted rescanning 5 → 6 → 7 → 8 routes as the pages were added, and the server's
route module listed all of them. The route list reaches the browser as Vite's pre-bundled
`.vite/deps/@generouted_react-router_lazy.js?v=4903d0a0`, served `Cache-Control: max-age=31536000, immutable`;
my browser cached the 5-route copy at the board checkpoint. `main.tsx` and page modules are `no-cache` (so the
NEW 404 design showed up), but the route-list URL never changed, so it was never re-fetched.
**Correction:** I first reported that deleting `node_modules/.vite` gave a new hash (`ec13ccb5`). That hash was
transient during startup; Vite settled back on `4903d0a0` (derived from lockfile + config, which didn't change),
so clearing the cache could NOT have helped a browser holding the old copy.
**Fix:** a hard reload (Cmd+Shift+R) or a private window. Can't happen in production: built files have
content-hashed names. Side note: each local test run regenerates `.dev.vars`, which restarts the dev server.
**Also:** 404 page restyled — "Go home" uses the kit's `buttonVariants()` (theme radius, not a pill).

### Nov 23 — post form defaults + 24h maximum
- Post form defaults: tomorrow at the next full local hour, ending 4h later (valid without edits).
- Shifts longer than 24h (exactly 24h is allowed) are rejected: one shared rule in `src/lib/shift-state.ts`
  (`isShiftTooLong`, message "A shift can be at most 24 hours long.") used by `postShift` and the form.
  Tests: unit (24h ok, 24h+1min and 4h cases) and API (`team-and-shifts.spec.ts`: two too-long cases in
  "rejects bad times"; exactly-24h accepted, posted by Worker C to stay off Spike A's open-shift cap).
- Form check verified by tsc + unit only — the API test covers the server message.

### Nov 23 — production prep (before deploy)
- Build check: eslint clean; tsc + 13/13 unit; `vite build` + prerender OK; dev-only names absent from worker and
  client bundles (`seedDemo` present). Full suite before: 38/38 Playwright + 13/13 unit.
- Manager invites (single-use, 30 days, via `scripts/new-invite.mjs` default mode; codes shown once in the session,
  never written to a file): `inv-owner-d79a`, `inv-reviewer-cdc3` (expire 2026-12-23 19:26 UTC),
  `inv-reviewer-1682`, `inv-reviewer-d313` (expire 2026-12-23 19:29 UTC).
- `MANAGER_INVITES` set in `--config prd` via stdin (base64 of the four hash entries; replaces the prd list).
  Each code verified against its entry before setting. `secrets list --config prd --only-names` → only
  `MANAGER_INVITES`; its value fingerprint matches the built value and differs from localtest's.

### Nov 23 — deployed
- `npx deepspace deploy` → release #2 `rel_01M84Y8X92VW608C88TY324X0K`, commit `e3a70d3`, live at
  https://shiftrelay.app.space (rollback to #1 `rel_01M8350DJQXJ9W31NTBZ2WW7RM` available).
- Checked from outside, signed out: landing serves the real title + headline in the static HTML;
  /home → "Shift board"; /post, /activity, /queue, /settings → "Sign in to continue"; /nope → "Page not
  found"; no page errors; /api/auth/ok 200. Signed-in flows, invites and demo seed: owner checklist (manual).

### Nov 23 — pre-GitHub history audit (nothing pushed)
- Scanned all 34 commits (full patches + messages, all refs) for exact values: the 4 prd invite codes, the 3 local
  fixture codes, every `.dev.vars` value (incl. APP_OWNER_JWT, APP_IDENTITY_TOKEN, OWNER_USER_ID), the prd and
  localtest MANAGER_INVITES values → **all absent**. `.dev.vars`, `tests/.invites.local.json`, `.env*` were never
  added in any commit.
- Pattern scan: no JWTs, GitHub/sk-/AWS keys, PEM blocks, Bearer tokens, password literals, 64-hex hashes.
  Only hits: `MANAGER_INVITES=` once in NOTES prose with a `...` placeholder (c3c65e6); 43-char strings = npm
  `sha512-` integrity hashes in package-lock.json (7fcd80d).
- `.gitignore` covers `.dev.vars*`, `tests/.invites.local.json`, `.wrangler`, `.deepspace`, `dist`, `test-results`.
  Gaps (files don't exist yet): `.env*`, `.claude/settings.local.json`.
- Public on GitHub: author identity "Ishani Bhadlikar <personal gmail>" on every commit; test-account emails
  (`@deepspace.test`) in NOTES/tests (passwords are local only).
- `deepspace app source` → `deepspace` (claimed). A GitHub remote is a copy; it can't change the deploy source.

### Nov 23 — email notifications (P1)
**What I did**
- `src/actions/notify.ts`: `notify(tools, event, { dryRun })` via `tools.integration('email/send', { from, to,
  subject, text })` ($0.013/request, developer billing → owner's credits; `email` not in src/integrations.ts).
  Call shape confirmed with `npx deepspace integrations info email/send` (required: to, subject; text or html).
- Sent ONLY by the action that won its unique write, after the write: `claimShift` → poster + all managers;
  `approveClaim`/`rejectClaim` → claimant + poster; `releaseClaim` → poster. No email on post.
- Recipients server-side: addresses from `users` rows, managers from `team_members` (role = manager). Skips the
  actor, `demo-*` ids, users without a valid email; de-duplicated (poster-who-is-manager gets one, as poster);
  max 10 per event; one email per recipient (no shared addresses).
- Plain text: who acted, title, date + time in UTC ("Tue 8 Dec 2026, 19:00–23:00 UTC"; overnight shows the end
  day), the board link. Sender `ShiftRelay <shiftrelay@app.space>`, no reply_to.
- Never fails the action: notify() can't throw; each send has a 5 s timeout and is settled separately; failures
  are logged as `[email] <kind> to user <id> … failed: <reason>` (user id, never the address). Actions await the
  sends (ActionContext has no waitUntil).
- Dry run: `emailDryRun(env) = import.meta.env.DEV || env.EMAIL_DRY_RUN === "true"`. DEV covers the dev server
  and every test run (`npm run dev` materializes the PRD secrets by default, so a localtest-only secret would
  not have protected local dev). `EMAIL_DRY_RUN=true` in prd = production off switch (not set).
- DEV builds only: the winning action's response carries `data.emails` (what it would have sent).
- `npm run check:bundle` (scripts/check-bundle.mjs, run after `npm run build`): dev-only actions, unreplaced
  `import.meta.env.DEV`, `data.emails` and any client-side email code are absent; `email/send`, the off switch
  and `seedDemo` present; `emailDryRun` compiles to exactly `env.EMAIL_DRY_RUN === "true"`.

**Tests (no real email, no credits)**
- Unit `src/actions/notify.test.ts` (18): recipients (actor/demo/dedupe/cap), UTC formatting, text; dry run
  never calls email/send; failed / throwing / hanging (5 s timeout) sends and a throwing lookup never throw and
  log user ids, not addresses.
- E2E `tests/email.spec.ts` (5): claim → poster + Manager M, not claimant (spoofed claimantId ignored); approve
  and reject → exactly claimant + poster; release → exactly poster; double-claim and release-vs-approve races →
  only the winner carries emails. Addresses match the accounts' real emails (server-side lookup).

**Verify on production (after deploy)**: one real email to your own address — who it comes from (docs vs
catalog, below), delivery, and the link.

## What I verified
- Nov 23 — Clicked Reset demo data on Settings as the owner, locally: 'Demo data ready.' This confirms the owner-success path the automated tests can't reach.
- Nov 23 — Board checkpoint, clicked through locally with my own (never-joined) account: auto-join
  worked on first load (no "Couldn't join the team"); Claim and Release (with confirm dialog) work;
  two tabs on the same account updated live without reloading. Asked for four polish tweaks (Claim
  under the status badge, fixed-width time column, faded in-progress cards, wrapping dialog title) —
  done in the next commit.
- Nov 23 — Full click-through locally (owner, also a manager): approved the demo claim (board shows Covered);
  checked all three post-form errors; posted a shift (shows "Posted by you"); checked My activity. /queue
  worked in a private window (the normal-window 404 was the stale dev route-list cache above).

## What I verified (production)
- Nov 23 — On https://shiftrelay.app.space (release #2, commit e3a70d3), all by hand:
  - Auto-join worked for a second real account.
  - Owner invite (`inv-owner-d79a`) redeemed → manager; wrong inputs gave the generic error.
  - Approved the demo claim on the Queue → board shows Covered.
  - 24h limit: a shift longer than 24 hours is refused with the shared message.
  - Live sync: a claim from the second account appeared in my owner window without a reload; Release (with the
    confirm dialog) updated both windows.
  - Reusing the owner code from the second account → "This invite has already been used."
  - Reset demo data at the end, so reviewers find the pending demo claim.

## Tradeoffs (for the writeup)
- **Reads are open to any signed-in user**, even before `joinTeam`. RBAC only sees the platform role
  (viewer/member/admin), not `team_members`, so it can't restrict reads to team members. Accepted because
  any signed-in user may join anyway; the alternative (all reads via actions) costs realtime `useQuery`.
  Writes are unaffected: every write is an action that checks `team_members` itself.

## Later (out of scope)
- UI loads ALL decisions (unfiltered useQuery) so an old approval can't be dropped by a limit; fine for one
  workplace, revisit (server-side per-shift state or paging) if the audit grows to thousands of rows.
- Suggested features (not built): "Your shift" filter on the board; per-day "who's covering" summary for managers.
- Before submission: owner clicks Settings → Reset demo data on the live site and checks the demo state.
- Reset demo data right before submitting.
- README fallback: if demo shifts have passed, post your own shift from a second account.
- DONE (Nov 23): Email (P1) skips demo-* recipients.
- Email preferences / unsubscribe link; per-user opt-out (not built).
- If the platform keeps ignoring `from`, recipients see "DeepSpace Apps" — consider the own-domain Resend route
  (RESEND_API_KEY secret) for a branded sender.
- Test invite fixtures: suffix fixture invite ids per generation (e.g. `test-mgr-m-<rand>`) so regenerating them re-exercises the fresh-redemption path (fixed ids always hit the retry path once redeemed).
- Before submission, verify on the live site with a throwaway prd invite, then remove it.
- DONE (Nov 23): reviewer invites generated and MANAGER_INVITES set in --config prd; expiry recorded above.
- DONE (Nov 23): tests use the real invite path; devPromoteSelfToManager deleted.
- claimShift daily cap is not atomic (concurrent claims can exceed it) — soft by design.
- postShift soft cap is not atomic (two concurrent posts can both pass) — soft by design.

## Report to DeepSpace
- The CLI's .dev.vars writer escapes quotes and dotenv keeps the backslashes, which breaks JSON secrets locally
  (worked around with base64 for MANAGER_INVITES).
- `email/send` sender: the docs (guides/external-apis "Sending email"; agents/cron-every-monday-morning-weekly-
  reminder) say to send from `<app-name>@app.space` and that other senders are rejected, but the live catalog
  (`npx deepspace integrations info email/send`, CLI 0.44.2, Nov 23) says "Send a transactional email from
  DeepSpace Apps <notifications@updates.app.space>. Any from value is ignored; use reply_to for replies." One of
  them is out of date. We send `ShiftRelay <shiftrelay@app.space>`; the first real production email will show
  which is true.
