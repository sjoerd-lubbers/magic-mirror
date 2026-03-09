import { cleanupExpiredActiveTimers } from "@/lib/timers";

let workerStarted = false;
let workerRunning = false;

function getSweepIntervalMs() {
  const raw = Number(process.env.TIMER_COMPLETION_SWEEP_MS ?? 5000);
  if (!Number.isFinite(raw)) {
    return 5000;
  }

  return Math.max(1000, Math.floor(raw));
}

async function runSweep() {
  if (workerRunning) {
    return;
  }

  workerRunning = true;

  try {
    const completed = await cleanupExpiredActiveTimers();
    if (completed > 0) {
      console.info("Timer completion sweep", { completed });
    }
  } catch (error) {
    console.error("Timer completion sweep mislukt", { error });
  } finally {
    workerRunning = false;
  }
}

export function startTimerCompletionWorker() {
  if (workerStarted) {
    return;
  }

  workerStarted = true;
  const intervalMs = getSweepIntervalMs();
  console.info("Timer completion worker gestart", { intervalMs });

  void runSweep();
  const handle = setInterval(() => {
    void runSweep();
  }, intervalMs);

  if ("unref" in handle && typeof handle.unref === "function") {
    handle.unref();
  }
}
