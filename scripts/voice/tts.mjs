// ElevenLabs text-to-speech. Requests an Opus/OGG stream directly so it can
// go straight to Telegram's sendVoice as a real voice note; if the account
// tier doesn't allow that output format, falls back to MP3 and the caller
// sends it as a regular audio message instead.

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

export async function synthesizeSpeech(text, { apiKey, voiceId }) {
  const attempt = async (outputFormat) => {
    const res = await fetch(
      `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}?output_format=${outputFormat}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );
    return res;
  };

  let res = await attempt("opus_48000_64");
  let isOpus = true;

  if (!res.ok) {
    // Opus output is gated on some tiers — fall back to the universally
    // available MP3 format rather than failing the whole delivery.
    isOpus = false;
    res = await attempt("mp3_44100_128");
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${body}`);
  }

  const audio = Buffer.from(await res.arrayBuffer());
  return { audio, isOpus };
}
