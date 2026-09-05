// Pidgin narration templates for the voice-only member's round-status updates.
// Nigerian Pidgin is used because it renders naturally through an
// English-trained TTS model — unlike Igbo/Yoruba, it needs no special
// language support to sound correct, which matters when this voice note is
// someone's *only* interface to the circle.

function ordinal(n) {
  const num = n + 1; // rounds are 0-indexed on-chain, spoken as 1st, 2nd, ...
  const suffixes = ["th", "st", "nd", "rd"];
  const v = num % 100;
  return num + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

export function buildNarration(event) {
  switch (event.type) {
    case "contribution_confirmed":
      return event.isSelf
        ? `Ajo update: your contribution for round ${ordinal(event.round)} don land well well. We don record am for chain.`
        : `Ajo update: ${event.member} don pay their own for round ${ordinal(event.round)}.`;

    case "round_complete":
      return `Ajo update: everybody don pay for round ${ordinal(event.round)}. Payout dey come.`;

    case "payout_released":
      return `Ajo update: round ${ordinal(event.round)} payout don release to ${event.recipient} — ${event.amountSol} SOL. Next round don start.`;

    case "default_flagged":
      return event.isSelf
        ? `Ajo update: you miss the deadline for round ${ordinal(event.round)}, so we don mark you as default for that round. E dey permanent for chain, but you fit still pay make round complete.`
        : `Ajo update: ${event.member} miss the deadline for round ${ordinal(event.round)}. We don flag am for chain, permanent record.`;

    default:
      throw new Error(`Unknown event type: ${event.type}`);
  }
}
