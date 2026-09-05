// The single Gemini trigger: dispute adjudication. A smart contract can only
// see that a contribution didn't arrive — it can't tell "the transfer failed
// on-chain" apart from "the member walked away." This asks Gemini to read the
// on-chain evidence and draft a plain-language note for a human to review in
// Telegram before a default is treated as final. It never finalizes anything
// itself — the draft always goes to a human.

const GEMINI_MODEL = "gemini-3.6-flash";

const SYSTEM_INSTRUCTION = `You are a neutral case reviewer for Ajo Chain, an on-chain rotating
savings circle. A member has been flagged as "defaulted" for missing a round's contribution
deadline. Your only job is to read the on-chain evidence provided and draft a short, plain-language
note for a human moderator, distinguishing between two possibilities:

1. The member likely TRIED to pay and it failed on-chain (e.g. a failed transaction to this
   program near the deadline, insufficient balance at the time, or network/RPC errors visible
   in their recent transaction history).
2. The member shows NO signs of an attempt (no relevant transactions near the deadline, or an
   attempt that long precedes/follows the deadline unrelated to this contribution).

Rules:
- Base your note ONLY on the evidence given. Do not invent transactions or intentions.
- Never claim certainty about intent ("walked away") -- describe what the evidence shows and
  what it suggests, and flag if the evidence is ambiguous or insufficient.
- Keep the note under 120 words, in plain language a non-technical group moderator can act on.
- End with one line stating what you recommend the moderator do next (e.g. "keep the default
  flag", "give the member a chance to explain", "insufficient evidence either way").
- You are drafting for human review, not making the final call. Never say the default is
  overturned or confirmed -- only what the evidence suggests.`;

export async function draftAdjudicationNote(evidence, { apiKey }) {
  const prompt = `On-chain evidence for a disputed default:\n\n${JSON.stringify(evidence, null, 2)}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  if (!text) throw new Error(`Gemini returned no text: ${JSON.stringify(json)}`);
  return text.trim();
}
