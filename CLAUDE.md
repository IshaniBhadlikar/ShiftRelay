See [AGENTS.md](./AGENTS.md).

# ShiftRelay — instructions for Claude Code

ShiftRelay is a reliable shift handoff for ONE workplace:
post a shift → a coworker claims it → a manager approves or rejects.
It records the handoff; it does not change any official schedule.

Built on the DeepSpace SDK. Deadline: **Tue Nov 24, 11:59 PM ET. Code freeze Tue 2 PM PT.**

## How to work in this repo

- Use the `deepspace` skill and docs.deep.space (MCP: https://docs.deep.space/mcp, any page + `.md`)
  as the authority. If the docs and this file disagree, STOP and tell me — don't silently pick one.
- Before writing code for a new area, show me a short plan and wait for my OK.
- Never weaken, skip, or delete a test to make it pass. If a test fails, explain the
  hypothesis and the fix.
- Never put secrets in code, the repo, or client bundles. Use `npx deepspace secrets`.
- Small commits, one concern each. Deploy after each working milestone.
- After each task, append to `NOTES.md`: what you did, what you assumed, what I should verify.
- Do not add features outside the scope below. Suggest them in NOTES.md under "Later" instead.

## Architecture (agreed — do not change without asking)

### Roles
- Stored in the app collection `team_members` (recordId = userId), `role: 'worker' | 'manager'`.
- Managers can do everything workers can, plus approve and reject.
- Nobody may decide their own claim.
- The platform `admin` role stays with the app owner only. Do NOT use `setRole` for managers.

### Collections — ALL client writes are `false`. Every write goes through a server action.
| Collection | Fields | Constraint |
|---|---|---|
| `team_members` | recordId=userId, role, displayName | keyed by userId |
| `shifts` | title, startsAt, endsAt, notes, postedBy, posterName | — |
| `claims` | shiftId, claimantId, claimantName, createdAt | `uniqueOn: ['shiftId']` |
| `decisions` | claimId, shiftId, outcome: approved/rejected/released, actorId, at | `uniqueOn: ['claimId']` |
| `invite_redemptions` | inviteId, userId, at | `uniqueOn: ['inviteId']` |

### Shift state is DERIVED, never stored
- no claim → open
- claim, no decision → claimed
- claim + approved decision → covered
- claim + rejected/released decision → open (claim row is stale; cleaned up lazily)

### Server actions (actor ALWAYS from `ctx.userId`, never from params)
Actions bypass RBAC — every action does its own checks and scopes its own queries.
Read a user's row via `tools.get('users', userId)`; data lives at `result.data.record.data`.

- `joinTeam` — any signed-in user; upsert as worker; never downgrade a manager; idempotent.
- `redeemManagerInvite(code)` — invites in secret `MANAGER_INVITES` as JSON
  `[{id, codeHash, expiresAt}]`. Constant-time compare of hash, check expiry.
  Create `invite_redemptions`. Success → grant manager. Duplicate → if same userId,
  finish the grant (retry-safe); else "already used".
- `postShift` — valid times, future start; soft cap 3 open shifts per poster.
- `claimShift(shiftId)` — not own shift, not started, state open; soft cap 5 claims/user/day.
  Delete any stale claim for the shift, then create. Duplicate ack → "already claimed".
- `releaseClaim(claimId)` — claimant only. Create `released` decision; if it wins, delete claim.
- `approveClaim` / `rejectClaim(claimId)` — manager in `team_members`, not the claimant.
  Create decision; if it wins: approve keeps claim, reject deletes claim.
- `seedDemo` — owner only (`env.OWNER_USER_ID`). Fixed record ids (`demo-*`), upsert,
  idempotent. Records labelled "Demo coworker".

Only the action that WINS the unique write sends email or continues. Losers return a clear error.

### Email (P1)
`email/send` integration, only on claim (→ poster + managers) and decision (→ claimant + poster).
Never on post. Email failure must not undo the state change; log it.

## Scope
- P0: deploy, joinTeam, post, claim, approve/reject/release, manager invite, seedDemo,
  tests 1 + 3, README.
- P1: test 2, email + caps, empty/error/loading states.
- P2: video, polish.
- OUT: cancel shift, enforced overlap checks, chat, presence, multi-team, cron, AI, payments.

## Tests (Playwright multi-user fixture)
1. Double claim: two users claim the same shift concurrently → exactly one succeeds.
2. Decision race: release + approve concurrently → exactly one decision; both users see the same state.
3. Authz: worker calls approveClaim → rejected; manager approving own claim → rejected.

## Day-1 spikes (must pass before building on them)
a. Inside an action, read the caller's role via `tools.get('users', userId)` → `result.data.record.data.role`.
b. `tools.create` from an action returns `success: false` on a `uniqueOn` duplicate.
c. After deleting a claim, a new claim with the same `shiftId` succeeds.

