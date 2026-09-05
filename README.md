# Ajo Chain

On-chain ajo/esusu (West African rotating savings circle) for the DEV Weekend Challenge: Generosity Edition.

A fixed group of 5 members contributes a fixed amount each round; payout rotates to one member per round
in a fixed order. Ajo Chain replaces the trust the practice normally requires — that the pot holder won't
disappear, that a member won't vanish after their payout — with on-chain enforcement.

- **Solana (Anchor, devnet)** — enforcement layer: escrow, rotation order, default tracking.
- **Cloudflare Worker + D1** — orchestration + public `/status` transparency page.
- **ElevenLabs** — voice-only member access (no text fallback).
- **Gemini** — voice interpretation + dispute adjudication.

See [SPEC.md](./SPEC.md) for the full build spec.

Devnet only. No real fund custody.

## Status

- ✅ **Day 1 — Solana program (core, load-bearing):** `create_group`, `contribute`,
  `mark_default`, `release_payout` implemented and tested (litesvm: happy-path
  round, deliberate default, non-member/double-contribution rejection).
  Deployed and verified end-to-end on devnet — see
  [`scripts/devnet_smoke_test.mjs`](./scripts/devnet_smoke_test.mjs).
  Program ID: `9RGBLQCcQnsiCdu9RcmEzG4SvihkfTvi1KMz98KCWPoT`
- ⏳ Day 2 — ElevenLabs voice-only member access
- ⏳ Day 2 — Gemini transcription + dispute adjudication
- ⏳ Day 3 — Cloudflare Worker + D1 orchestration, `/status` page, demo, submission post
