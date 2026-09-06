# Ajo Chain — Adversarial Test Brief

Context for an external testing agent (Antigravity). This is a DEV Weekend Challenge hackathon
submission, devnet-only, no real fund custody. Program ID: `9RGBLQCcQnsiCdu9RcmEzG4SvihkfTvi1KMz98KCWPoT`.
Worker: `https://ajo-chain-worker.fpl-test.workers.dev`.

## Priority 1 — Solana program (moves real value, highest severity)

`programs/ajo_chain/src/instructions/release_payout.rs` is the highest-value target — it's the
only instruction that pays lamports out of escrow.

- **Recipient redirection**: try calling `release_payout` with a `recipient` account that is NOT
  `group.members[group.round_number]`. Expect `InvalidRecipient`. Check this is validated in the
  handler (not just as an account constraint) — confirm it can't be bypassed by account ordering
  or a stale `round_number` read.
- **Payout before all contributed**: call `release_payout` with fewer than 5 members having
  contributed this round. Expect `NotAllContributed`.
- **Double payout / round confusion**: call `release_payout` twice in a row for the same round
  without any new contributions in between. Expect the second call to fail `NotAllContributed`
  (since `has_contributed` resets to all-false after the first call).
- **Overflow**: try a `contribution_amount` near `u64::MAX` at `create_group`, then attempt the
  full round + payout. `contribution_amount.checked_mul(5)` should error cleanly, not panic or wrap.
- **Escrow PDA spoofing**: try passing an `escrow` account that isn't the real
  `["escrow", group.key()]` PDA. Expect a seeds-constraint failure.
- **Completed group**: try any instruction (`contribute`, `mark_default`, `release_payout`) after
  `group.completed == true` (round 5 paid out). Expect `GroupCompleted` on all of them.

`contribute.rs`:
- Non-member contributing: expect `NotAMember`.
- Double contribution same round: expect `AlreadyContributed`.
- Contributing after the round deadline: this is **intentionally allowed** (see commit history —
  a missed deadline permanently flags a default via `mark_default`, but does not lock the member
  out of paying). Don't flag this as a bug; it's a deliberate design decision.

`mark_default.rs`:
- Marking before the deadline: expect `DeadlineNotPassed`.
- Marking on a completed group: expect `GroupCompleted`.
- Repeated calls: should be idempotent (already-defaulted members aren't re-flagged, no error
  either way — confirm this doesn't panic or double-emit events in a way that misleads the Worker's
  D1 sync).

`create_group.rs`:
- Duplicate members (including a member appearing twice): expect `InvalidMembers`.
- Zero `contribution_amount` or zero `round_duration_secs`: expect the respective `Invalid*` error.
- Confirm five distinct members is enforced — a single wallet cannot occupy multiple rotation slots.

Tests already covering this: `programs/ajo_chain/tests/ajo_chain_test.rs` (litesvm — happy path,
deliberate default + late catch-up, non-member/double-contribution rejection). Try to find a case
those three tests miss.

## Priority 2 — Cloudflare Worker (`worker/src/index.js`)

- **No authentication** on `POST /sync` or `POST /disputes` — this is a known, accepted gap for a
  hackathon devnet demo, not something to "fix" here, but worth confirming the blast radius is
  actually limited: `/sync` only reads real on-chain accounts (a bogus pubkey 404s), `/disputes`
  only accepts a `memberPubkey` that's a real member of the group (validated server-side). The
  open question: can repeated `/disputes` calls be used to cheaply exhaust the Gemini API quota
  (cost-abuse, not data-integrity)? There's no rate limiting — confirm this is the only real
  consequence, not something worse.
- **Stored-XSS**: already found and fixed (commit `659d6da`) — the `note` field is free-form
  Gemini output rendered on the public `/status` page. All dynamic HTML interpolation in
  `renderStatusPage` now goes through `escapeHtml()`. Worth re-verifying: try injecting HTML/script
  content via the `round` parameter (currently passed through as a number, not escaped as a string
  — confirm D1's schema/JS coercion actually keeps it numeric) and via extremely long `note` text
  from a manipulated Gemini prompt.
- **SQL injection**: all D1 queries use `.bind()` parameterization, no string concatenation into
  SQL. Confirm there's no path that bypasses this.
- **Dispute integrity**: `/disputes` doesn't check that the submitted `round` matches the group's
  actual `round_number` — you can log a dispute for a round number that doesn't correspond to
  current on-chain state. This is a data-quality issue (pollutes the transparency page), not a
  security one — confirm it can't be escalated into something worse (e.g., does a bogus round
  number ever get used in a way that affects real accounting? It shouldn't — `/disputes` never
  writes to the `groups`/`members` tables, only `disputes`).

## Out of scope

- Devnet only — no mainnet deployment, no real fund custody, explicitly stated in the submission.
- ElevenLabs voice-only member access was scoped out entirely (see `SPEC.md`) — nothing to test there.
- The Worker's Gemini/Telegram secrets are not in the repo; don't waste time looking for them there.
