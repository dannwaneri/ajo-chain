# Ajo Chain

On-chain ajo/esusu (West African rotating savings circle) for the DEV Weekend Challenge: Generosity Edition.

A fixed group of 5 members contributes a fixed amount each round; payout rotates to one member per round
in a fixed order. Ajo Chain replaces the trust the practice normally requires — that the pot holder won't
disappear, that a member won't vanish after their payout — with on-chain enforcement.

- **Solana (Anchor, devnet)** — enforcement layer: escrow, rotation order, default tracking.
- **Cloudflare Worker + D1** — orchestration + public `/status` transparency page.
- **Gemini** — dispute adjudication: tells "transfer failed on-chain" apart from "member walked away".

See [SPEC.md](./SPEC.md) for the full build spec.

Devnet only. No real fund custody.

## Status

- ✅ **Day 1 — Solana program (core, load-bearing):** `create_group`, `contribute`,
  `mark_default`, `release_payout` implemented and tested (litesvm: happy-path
  round, deliberate default, non-member/double-contribution rejection).
  Deployed and verified end-to-end on devnet — see
  [`scripts/devnet_smoke_test.mjs`](./scripts/devnet_smoke_test.mjs).
  Program ID: `9RGBLQCcQnsiCdu9RcmEzG4SvihkfTvi1KMz98KCWPoT`
- ✅ **Day 2 — Gemini dispute adjudication:** reads real on-chain evidence (group
  round state + member's recent transaction history) and drafts a
  plain-language note distinguishing a failed on-chain transfer from a
  member showing no attempt to pay, for human review before a default is
  final. Verified on devnet against a real deliberate-default scenario —
  see [`scripts/gemini/`](./scripts/gemini/) and
  [`scripts/devnet_default_scenario.mjs`](./scripts/devnet_default_scenario.mjs).
- ✅ **Day 3 — Cloudflare Worker + D1 orchestration + public status page:**
  `POST /sync` indexes a group's on-chain state and transaction log into D1;
  `POST /disputes` runs the Gemini trigger and stores the result;
  `GET /status/:group` is the public transparency page. Deployed at
  https://ajo-chain-worker.fpl-test.workers.dev — see
  [`worker/`](./worker/). Live example:
  https://ajo-chain-worker.fpl-test.workers.dev/status/EkM468mabv127E6jwrcLrhSEmFWShdU3drFAm2uRCLwH
- ⏳ Demo video, submission post

**Note:** ElevenLabs voice-only member access was scoped out — see SPEC.md's 2026-09-05 note. Free-tier
API access blocks premade voices; not worth the remaining time against the deadline.
