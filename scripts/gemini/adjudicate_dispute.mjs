// CLI entry point for the dispute-adjudication trigger.
//
// Usage:
//   node adjudicate_dispute.mjs <groupPubkey> <memberPubkey> <round>
//
// Requires GEMINI_API_KEY (see .env.example).

import { gatherEvidence, connectDevnet } from "./evidence.mjs";
import { draftAdjudicationNote } from "./adjudicate.mjs";

async function main() {
  const [groupPubkey, memberPubkey, roundArg] = process.argv.slice(2);
  if (!groupPubkey || !memberPubkey || roundArg === undefined) {
    console.error("Usage: node adjudicate_dispute.mjs <groupPubkey> <memberPubkey> <round>");
    process.exit(1);
  }
  const round = Number(roundArg);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY in environment");

  const connection = connectDevnet();

  console.log("Gathering on-chain evidence...");
  const evidence = await gatherEvidence({ connection, groupPubkey, memberPubkey, round });
  console.log(JSON.stringify(evidence, null, 2));

  console.log("\nAsking Gemini to draft an adjudication note...");
  const note = await draftAdjudicationNote(evidence, { apiKey });

  console.log("\n=== Draft note for human review (Telegram) ===");
  console.log(note);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
