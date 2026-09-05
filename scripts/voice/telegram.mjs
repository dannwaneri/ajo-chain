// Sends the synthesized audio to the voice-only member as a Telegram voice
// note (real waveform bubble, requires OGG/Opus) or, if ElevenLabs only gave
// us MP3, as a regular audio message — still delivered, still voice-first,
// just without Telegram's native voice-bubble UI.

export async function sendTelegramAudio({ botToken, chatId, audio, isVoice, caption }) {
  const method = isVoice ? "sendVoice" : "sendAudio";
  const fileField = isVoice ? "voice" : "audio";
  const filename = isVoice ? "update.ogg" : "update.mp3";
  const mimeType = isVoice ? "audio/ogg" : "audio/mpeg";

  const form = new FormData();
  form.set("chat_id", chatId);
  if (caption) form.set("caption", caption);
  form.set(fileField, new Blob([audio], { type: mimeType }), filename);

  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    body: form,
  });

  const body = await res.json();
  if (!body.ok) {
    throw new Error(`Telegram ${method} failed: ${JSON.stringify(body)}`);
  }
  return body.result;
}
