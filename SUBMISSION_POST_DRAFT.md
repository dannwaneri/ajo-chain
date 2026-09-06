This is a submission for [Weekend Challenge: Generosity Edition](https://dev.to/challenges/weekend-2026-09-03)

## What I Built

My late grandmother was a trader. She ran ajo for years, the way a lot of Nigerian market women did, and used her payout round to restock her shop. More stock meant more sales meant more saved for the next round. It worked, until the round it didn't: she told me about a time the person holding the pot borrowed against it to solve a family problem and couldn't pay it back in time. He didn't vanish maliciously. He just couldn't make the group whole again, and the circle absorbed the loss.

That's the actual failure mode. Not fraud, most of the time. Just one person holding money that isn't theirs, under pressure, with no enforcement above their own word.

Ajo Chain is my answer to that specific story. Before I wrote a line of code, I set one rule: if you deleted a technology, would something actually break, or would the project just look less polished? Everything that failed that test got cut. One whole technology did, and I'll get to why.

Ajo (also called esusu) is a rotating savings circle. Five people, one fixed amount each round, one payout that rotates to a different person every round.

Ajo Chain doesn't digitize the spreadsheet. It replaces the one person everyone has to trust with a Solana program that can't disappear. Escrow, rotation order, and default tracking all live on-chain. Contributions only release to the next member in the fixed order, and only once all five have paid. A missed deadline gets flagged permanently. It's visible forever, not something a moderator can quietly erase later.

The part I didn't expect going in: the smart contract can tell you a contribution didn't arrive. It can't tell you *why*. So I added one narrow Gemini agent whose only job is reading the on-chain evidence around a disputed default and drafting a plain-language note for a human moderator, distinguishing "the transfer failed on-chain" from "this member shows no attempt to pay." It never finalizes anything. It drafts, a human decides.

Devnet only. No real fund custody.

## Demo

Live transparency page, still on devnet, walking a real completed round (four members on time, one deliberate default, Gemini's note, a late catch-up, payout released):

https://ajo-chain-worker.fpl-test.workers.dev/status/3XrTDiMxhznfBZLMxDrEVndP8YKwR1kCaN9HpeUxGRne

<!-- Video embed goes here -->

## Code

https://github.com/dannwaneri/ajo-chain

Program ID: `9RGBLQCcQnsiCdu9RcmEzG4SvihkfTvi1KMz98KCWPoT`

## How I Built It

### Solana is the enforcement layer

This is the only part I'd call load-bearing without qualification. Each group gets an escrow PDA and a fixed rotation order set once at creation. Four instructions: `create_group`, `contribute`, `mark_default`, `release_payout`. `release_payout` won't move a lamport until all five members have contributed, and it pays out to exactly one address: whoever is next in the array, checked directly in the handler, not just in an account constraint I could talk myself into trusting. Delete this layer and you're back to trusting one person with the pot. That's the whole reason the project exists.

I tested it with litesvm instead of a local validator. Three tests, in-process, no faucet, no network: a full happy-path round, a deliberate default followed by a late catch-up that still completes the round, and rejection of non-members and double-contributions. Then I deployed to devnet and ran the same story for real, five contributions and one payout, with real signatures and real Explorer links. Somewhere in there I also learned that `api.devnet.solana.com` blocks Cloudflare's IP ranges outright, which nobody documents until you hit it. QuickNode's free devnet endpoint doesn't have that problem.

### Gemini is the fairness layer, and I'm going to undersell it on purpose

It reads the group's on-chain round state plus the disputed member's recent transaction history, then drafts a short note: did the evidence show an attempt that failed, or no attempt at all? That's my grandmother's story again, the same question a human circle asked about the same kind of person, just with transaction signatures instead of memory and reputation. Two different load-bearing questions here, and they get two different answers. For the project as a whole: no, delete Gemini and the Solana program is untouched, nobody loses money, nobody gets locked out. For the dispute-adjudication feature itself: yes. Delete Gemini and a real ajo moderator is staring at raw transaction signatures and `err` fields, trying to work out whether someone tried and failed or just didn't show up. That's not information a non-technical person can act on. The feature doesn't survive losing it. The product does.

### Cloudflare Worker + D1 makes the first two legible to a human

`POST /sync` indexes a group's on-chain state and its full transaction log into D1. `POST /disputes` runs the Gemini trigger and stores the result. `GET /status/:group` is the public page: rotation order, per-round status, the permanent default flag, every transaction linked to Explorer, and the dispute note sitting right there next to it. That page is the actual submission, more than any single instruction is.

### What I cut: ElevenLabs

The original plan had a fifth member with no text fallback at all, a voice note as their only interface to the circle. I got as far as an API key, a voice ID, a working TTS call, and then found out ElevenLabs' free tier blocks API access to any premade or library voice. Only a self-cloned voice or a paid plan gets through. I tried Instant Voice Cloning next, got most of the way through the upload flow, and the clone never actually saved. At that point I had a choice: keep spending hours on an integration, or ship a submission that's honest about what it does well. I cut it. The spec file in the repo still has the original design, timestamped.

### The bug I almost shipped

Writing an adversarial-test brief for a security pass, I re-read my own `/status` page code and noticed the dispute note (free-form text Gemini writes) was going straight into HTML with no escaping, on a page anyone can write to since `/disputes` has no auth. I fixed it, then verified the fix by injecting a real `<script>` tag directly into the database and confirming it rendered as inert text, not a live tag. That fix is commit `659d6da` if you want to see the diff.

## Prize Categories

Submitting to:

- **Best Use of Solana** — the escrow, rotation, and default enforcement is the mechanism the whole project exists to provide, not a wrapper around a database
- **Best Use of Google AI** — one narrow Gemini trigger, reasoning over real on-chain evidence, that drafts and never finalizes

Not submitting for ElevenLabs. See above.

---

Devnet only, no real fund custody, and the on-chain program is the piece I'd stake the submission on. Everything else in this stack exists to make that piece visible and fair to the people actually running the circle.
