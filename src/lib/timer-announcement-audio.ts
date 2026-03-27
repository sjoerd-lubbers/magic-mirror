import crypto from "crypto";
import { execFile } from "child_process";
import { mkdir, readFile, rename, rm, stat } from "fs/promises";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const TIMER_TTS_VOICE_ID = "espeak-ng:nl:145:ffmpeg-mp3:v1";
const DEFAULT_CACHE_DIR = path.join("/tmp", "magic-mirror", "timer-announcements");
export const TIMER_ANNOUNCEMENT_TEST_MESSAGE =
  "Dit is een test van het timer meldvolume.";

function normalizeMessage(message: string) {
  return message.trim().replace(/\s+/g, " ").slice(0, 200);
}

function timerAnnouncementCacheDir() {
  const configured = process.env.TIMER_TTS_CACHE_DIR?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_CACHE_DIR;
}

function timerAnnouncementAudioPath(key: string) {
  return path.join(timerAnnouncementCacheDir(), `${key}.mp3`);
}

export function isValidTimerAnnouncementAudioKey(key: string) {
  return /^[a-f0-9]{64}$/.test(key);
}

export function buildTimerAnnouncementAudioUrl(key: string) {
  return `/api/timer-announcements/${encodeURIComponent(key)}`;
}

export function formatTimerAnnouncementDurationLabel(durationSeconds: number) {
  if (durationSeconds < 60) {
    return `${durationSeconds} seconden`;
  }

  return `${Math.round(durationSeconds / 60)} minuten`;
}

export function buildTimerAnnouncementMessage({
  greetingName,
  durationSeconds,
}: {
  greetingName: string | null;
  durationSeconds: number;
}) {
  const safeGreetingName = greetingName?.trim() || "daar";
  const durationLabel = formatTimerAnnouncementDurationLabel(durationSeconds);
  return `Hoi ${safeGreetingName}, de timer van ${durationLabel} is klaar.`;
}

export function buildTimerAnnouncementAudioKey(message: string) {
  const normalized = normalizeMessage(message);
  return crypto
    .createHash("sha256")
    .update(`${TIMER_TTS_VOICE_ID}:${normalized}`)
    .digest("hex");
}

export async function prepareTimerAnnouncementAudio(message: string) {
  const normalizedMessage = normalizeMessage(message);
  const key = buildTimerAnnouncementAudioKey(normalizedMessage);
  const outputPath = timerAnnouncementAudioPath(key);

  await mkdir(timerAnnouncementCacheDir(), { recursive: true });

  try {
    await stat(outputPath);
    return key;
  } catch {
    // File bestaat nog niet; ga door met genereren.
  }

  const tempPath = `${outputPath}.${process.pid}.${Date.now()}.mp3`;
  const tempWavPath = `${outputPath}.${process.pid}.${Date.now()}.wav`;

  try {
    await execFileAsync("espeak-ng", [
      "-v",
      "nl",
      "-s",
      "145",
      "-w",
      tempWavPath,
      normalizedMessage,
    ]);

    await execFileAsync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      tempWavPath,
      "-codec:a",
      "libmp3lame",
      "-q:a",
      "4",
      tempPath,
    ]);

    await rm(tempWavPath, { force: true }).catch(() => undefined);
    await rename(tempPath, outputPath);
  } catch (error) {
    await rm(tempWavPath, { force: true }).catch(() => undefined);
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }

  return key;
}

export async function readTimerAnnouncementAudio(key: string) {
  if (!isValidTimerAnnouncementAudioKey(key)) {
    return null;
  }

  try {
    return await readFile(timerAnnouncementAudioPath(key));
  } catch {
    return null;
  }
}
