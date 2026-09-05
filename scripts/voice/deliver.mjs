// Delivers one round-status update to the voice-only member as a Telegram
// voice note. This is the load-bearing path: for that member, this script
// (or its Day 3 Worker equivalent, triggered by the same on-chain events) is
// their only way to know what happened in the circle — delete it and they
// are locked out, which is the point.
//
// Usage:
//   node deliver.mjs '{"type":"payout_released","round":0,"recipient":"Ada","amountSol":0.005}'
//
// Required env vars (see .env.example): ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID,
// TELEGRAM_BOT_TOKEN, and either --chat-id=<id> or a members.json entry with
// voiceOnly:true and a telegramChatId.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNarration } from "./narrate.mjs";
import { synthesizeSpeech } from "./tts.mjs";
import { sendTelegramAudio } from "./telegram.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadVoiceOnlyChatId() {
  const membersPath = path.join(__dirname, "members.json");
  if (!fs.existsSync(membersPath)) return null;
  const { members } = JSON.parse(fs.readFileSync(membersPath, "utf-8"));
  const voiceOnly = members.find((m) => m.voiceOnly);
  return voiceOnly?.telegramChatId ?? null;
}

async function main() {
  const eventArg = process.argv[2];
  if (!eventArg) {
    console.error("Usage: node deliver.mjs '<event-json>'");
    process.exit(1);
  }
  const event = JSON.parse(eventArg);

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || loadVoiceOnlyChatId();

  for (const [name, val] of Object.entries({ apiKey, voiceId, botToken, chatId })) {
    if (!val) throw new Error(`Missing required config: ${name}`);
  }

  const text = buildNarration(event);
  console.log(`Narration: "${text}"`);

  console.log("Synthesizing speech via ElevenLabs...");
  const { audio, isOpus } = await synthesizeSpeech(text, { apiKey, voiceId });
  console.log(`  got ${audio.length} bytes (${isOpus ? "opus" : "mp3 fallback"})`);

  console.log("Sending to Telegram...");
  const result = await sendTelegramAudio({
    botToken,
    chatId,
    audio,
    isVoice: isOpus,
    caption: event.type,
  });
  console.log(`  delivered, message_id=${result.message_id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
