# Ajo Chain — Build Spec

## Context
DEV Weekend Challenge: Generosity Edition. Deadline: Sep 7, 2026, 6:59 AM UTC.
Prize categories targeted: Solana, ElevenLabs, Google AI (Gemini) — plus eligible for overall winner.
Theme ties: Ethical and accountable giving (Solana enforcement); Equity and inclusion (voice-only member access).

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
  wallet_address, telegram_id, is_voice_only), `rounds` (id, group_id, round_number, status), `defaults`
  (id, member_id, round_id, evidence, adjudication_status).
- Worker reads on-chain program state, writes status to D1, triggers notifications.
- Public `/status` page: rotation order, per-round contribution status, links to Solana Explorer devnet
  tx pages for every transaction. This page is the transparency proof for judging.

### 3. ElevenLabs — voice-only member access (load-bearing, not a duplicate channel)
- One designated member in the demo group is voice-only: no text fallback, ElevenLabs voice note is
  their only interface to round status (contribution confirmed, round complete, payout released,
  default flagged), delivered via Telegram voice note.
- Language: Igbo, Yoruba, or Pidgin (pick one for the demo).
- Deleting this feature locks that member out of the circle entirely — that's the load-bearing test passing.

### 4. Gemini — voice interpretation + dispute adjudication (load-bearing, one agent, two triggers)
- Trigger 1: transcribes and interprets the voice-only member's spoken replies into structured actions
  (confirm contribution, flag a problem).
- Trigger 2: on any disputed default, reviews on-chain evidence (failed tx logs, timing, wallet history)
  and drafts a plain-language note distinguishing "transfer failed on-chain" from "member walked away,"
  for human review in Telegram before the default is finalized.
- Keep scope narrow — do not let this become a general chatbot. Two triggers only.

## 3-day build order (strict priority — do not parallelize)
1. Day 1: Anchor program only. Full devnet test cycle. Stop here once solid.
2. Day 2 AM: ElevenLabs voice-status pipeline for the voice-only member.
3. Day 2 PM: Gemini — transcription/interpretation trigger, then dispute-adjudication trigger. If time
   runs short, cut this cleanly rather than rushing it — Solana + ElevenLabs alone is already a complete,
   coherent, non-generic submission.
4. Day 3: Full integration demo (contribute → voice confirmation → payout → forced default → Gemini
   adjudication note), demo video, submission post.

## Rules to keep in mind
- New project only, built entirely within the challenge window (Sep 3–7). Commit history is reviewed.
- Devnet only for the hackathon — state this plainly in the submission, no real fund custody.
- One submission per person/team; a single submission can qualify for multiple prize categories but
  wins are capped at one per challenge.

## Submission post framing
Lead with the real trust problem in ajo (pot holder absconding, post-payout dropout). Present the three
technologies as one coherent mechanism, not three demos bolted together: Solana = enforcement layer,
ElevenLabs = accessibility layer, Gemini = fairness layer. Explicitly name the UN theme framing DEV cited
(ethical/accountable giving, equity/inclusion) to show direct relevance, not retrofitted language.
