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
- [ ] a. role read via tools.get('users', userId)
- [ ] b. uniqueOn duplicate from tools.create in action
- [ ] c. re-claim after delete

## Later (out of scope)
