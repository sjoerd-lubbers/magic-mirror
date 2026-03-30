import crypto from "crypto";

const TIMER_TTS_VOICE_ID = "piper:nl_NL-ronnie-medium:q4:ffmpeg-mp3:v1";

function normalizeMessage(message: string) {
  return message.trim().replace(/\s+/g, " ").slice(0, 200);
}

export function buildTimerAnnouncementAudioKey(message: string) {
  const normalized = normalizeMessage(message);
  return crypto
    .createHash("sha256")
    .update(`${TIMER_TTS_VOICE_ID}:${normalized}`)
    .digest("hex");
}
