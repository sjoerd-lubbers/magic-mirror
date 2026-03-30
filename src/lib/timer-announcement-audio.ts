import { execFile, spawn } from "child_process";
import { mkdir, readFile, rename, rm, stat } from "fs/promises";
import path from "path";
import { promisify } from "util";
import { buildTimerAnnouncementAudioKey } from "@/lib/timer-announcement-key";

const execFileAsync = promisify(execFile);
const DEFAULT_CACHE_DIR = path.join("/tmp", "magic-mirror", "timer-announcements");
const DEFAULT_PIPER_BINARY = "/usr/local/bin/piper/piper";
const DEFAULT_PIPER_MODEL = "/usr/local/share/piper/nl_NL-ronnie-medium.onnx";
const DEFAULT_PIPER_CONFIG = "/usr/local/share/piper/nl_NL-ronnie-medium.onnx.json";

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

function piperBinaryPath() {
  const configured = process.env.PIPER_BINARY_PATH?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_PIPER_BINARY;
}

function piperModelPath() {
  const configured = process.env.PIPER_MODEL_PATH?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_PIPER_MODEL;
}

function piperConfigPath() {
  const configured = process.env.PIPER_CONFIG_PATH?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_PIPER_CONFIG;
}

async function synthesizeWithPiper({
  message,
  outputPath,
}: {
  message: string;
  outputPath: string;
}) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      piperBinaryPath(),
      [
        "--model",
        piperModelPath(),
        "--config",
        piperConfigPath(),
        "--output_file",
        outputPath,
      ],
      {
        stdio: ["pipe", "ignore", "pipe"],
      },
    );

    let stderr = "";

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Piper synthese mislukt met code ${code}${
            stderr.trim() ? `: ${stderr.trim()}` : ""
          }`,
        ),
      );
    });

    child.stdin.write(`${message}\n`);
    child.stdin.end();
  });
}

export function isValidTimerAnnouncementAudioKey(key: string) {
  return /^[a-f0-9]{64}$/.test(key);
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
    await synthesizeWithPiper({
      message: normalizedMessage,
      outputPath: tempWavPath,
    });

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
    console.info("Timer announcement audio voorbereid", {
      engine: "piper",
      key,
      model: path.basename(piperModelPath()),
    });
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
