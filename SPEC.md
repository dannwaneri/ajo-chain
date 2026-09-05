# Ajo Chain — Build Spec

## Context
DEV Weekend Challenge: Generosity Edition. Deadline: Sep 7, 2026, 6:59 AM UTC.
Prize categories targeted: Solana, Google AI (Gemini) — plus eligible for overall winner.
Theme tie: Ethical and accountable giving (Solana enforcement + Gemini-assisted fair dispute review).

**Scope change (2026-09-05):** ElevenLabs / voice-only member access was cut. ElevenLabs' free tier
blocks API access to any premade/library voice (only self-cloned voices or a paid plan work), and after
working through account setup, key permissions, and a failed Instant Voice Clone save, it wasn't worth
the remaining time against the deadline. Section 3 below is kept for the record; it was not built.

## Concept
Digitize ajo/esusu, the West African rotating savings circle. A fixed group of 5 members contributes a
fixed amount each round; the payout rotates to one member per round in a fixed order. The traditional
failure mode is trust: the pot holder disappears, or a member stops contributing after their payout.
Ajo Chain removes that failure mode with on-chain enforcement instead of removing the practice itself.

## Load-bearing test
Apply to every feature before building it: if you deleted this technology, would something actually
break — or just look less polished? Only ship features that break something real when removed.

## Architecture

### 1. Solana program (Anchor, devnet) — core mechanism
- One escrow PDA per group.
- Fixed group size: 5 members, fixed contribution amount, fixed rotation order set at group creation.
- Each round: all 5 must contribute before payout releases.
- Payout releases only to the member next in the fixed rotation order.
- Missed deadline → member marked as defaulted on-chain, permanently visible.
- Test end-to-end on devnet: full round cycle, one deliberate default, payout release.
- This is the load-bearing core. Build and fully test this before touching anything else.

### 2. Cloudflare Worker + D1 — orchestration layer
- D1 schema: `groups` (id, rotation_order, contribution_amount, round_number), `members` (id, group_id,
  wallet_address, telegram_id), `rounds` (id, group_id, round_number, status), `defaults`
  (id, member_id, round_id, evidence, adjudication_status).
- Worker reads on-chain program state, writes status to D1, triggers notifications.
- Public `/status` page: rotation order, per-round contribution status, links to Solana Explorer devnet
  tx pages for every transaction. This page is the transparency proof for judging.

### 3. ElevenLabs — voice-only member access — CUT, not built
- Originally: one designated member with no text fallback, ElevenLabs voice note as their only interface
  to round status, delivered via Telegram voice note. Cut per the 2026-09-05 scope change above.

### 4. Gemini — dispute adjudication (load-bearing, one agent, one trigger)
- On any disputed default, reviews on-chain evidence (failed tx logs, timing, wallet history) and drafts
  a plain-language note distinguishing "transfer failed on-chain" from "member walked away," for human
  review in Telegram before the default is treated as final.
- Keep scope narrow — do not let this become a general chatbot. One trigger only.

## 3-day build order (strict priority — do not parallelize)
1. Day 1: Anchor program only. Full devnet test cycle. Stop here once solid. — DONE
2. Day 2: Gemini dispute-adjudication trigger. If time runs short, cut this cleanly rather than rushing
   it — the Solana core alone is already a complete, coherent, non-generic submission.
3. Day 3: Cloudflare Worker + D1, `/status` page, full integration demo (contribute → forced default →
   Gemini adjudication note → payout), demo video, submission post.

## Rules to keep in mind
- New project only, built entirely within the challenge window (Sep 3–7). Commit history is reviewed.
- Devnet only for the hackathon — state this plainly in the submission, no real fund custody.
- One submission per person/team; a single submission can qualify for multiple prize categories but
  wins are capped at one per challenge.

## Submission post framing
Lead with the real trust problem in ajo (pot holder absconding, post-payout dropout). Present the two
technologies as one coherent mechanism, not two demos bolted together: Solana = enforcement layer,
Gemini = fairness layer (it can't stop a missed contribution, but it can tell "transfer failed on-chain"
apart from "member walked away" before a default is treated as final). Name the UN theme framing DEV
cited (ethical/accountable giving) to show direct relevance, not retrofitted language.
