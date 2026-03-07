"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type TimerPanelProps = {
  mirrors: Array<{
    id: string;
    name: string;
  }>;
};

type RunningTimer = {
  id: string;
  label: string | null;
  durationSeconds: number;
  endsAt: string;
  greetingName: string | null;
  requestedBy: string;
};

const PRESET_MINUTES = [3, 6, 10, 15, 20, 25, 30, 40, 50, 60] as const;
const TEST_PRESET_SECONDS = 10;

function formatRemaining(endsAt: string, nowMs: number) {
  const remainingSeconds = Math.max(
    0,
    Math.ceil((new Date(endsAt).getTime() - nowMs) / 1000),
  );
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatDurationLabel(durationSeconds: number) {
  if (durationSeconds < 60) {
    return `${durationSeconds}s`;
  }

  const minutes = Math.round(durationSeconds / 60);
  return `${minutes} min`;
}

export function TimerPanel({ mirrors }: TimerPanelProps) {
  const [mirrorId, setMirrorId] = useState(mirrors[0]?.id ?? "");
  const [durationMinutes, setDurationMinutes] = useState(6);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runningTimers, setRunningTimers] = useState<RunningTimer[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadRunningTimers = useCallback(async () => {
    if (!mirrorId) {
      setRunningTimers([]);
      return;
    }

    const response = await fetch(`/api/timers?mirrorId=${encodeURIComponent(mirrorId)}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const payload = (await response.json().catch(() => null)) as
      | {
          timers?: RunningTimer[];
        }
      | null;

    setRunningTimers(payload?.timers ?? []);
  }, [mirrorId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadRunningTimers().catch(() => undefined);
    }, 0);

    const interval = window.setInterval(() => {
      loadRunningTimers().catch(() => undefined);
    }, 5000);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [loadRunningTimers]);

  const visibleTimers = useMemo(
    () =>
      runningTimers
        .filter((timer) => new Date(timer.endsAt).getTime() > nowMs)
        .sort(
          (a, b) =>
            new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime(),
        ),
    [runningTimers, nowMs],
  );

  async function startTimer(duration: {
    minutes?: number;
    seconds?: number;
  }) {
    if (!mirrorId) {
      return;
    }

    setBusy(true);
    setStatus(null);
    setError(null);

    const response = await fetch("/api/timers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mirrorId,
        durationMinutes: duration.minutes,
        durationSeconds: duration.seconds,
        label: label.trim() || undefined,
      }),
    });

    setBusy(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Timer zetten mislukt");
      return;
    }

    if (typeof duration.seconds === "number") {
      setStatus(`Timer gezet voor ${duration.seconds} seconden.`);
    } else {
      setStatus(`Timer gezet voor ${duration.minutes ?? 1} minuten.`);
    }
    setLabel("");
    await loadRunningTimers();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await startTimer({ minutes: durationMinutes });
  }

  return (
    <div className="card card-narrow stack">
      <div className="stack-small">
        <h1>Timer zetten</h1>
        <p>Snelle mobiele timerbediening.</p>
      </div>

      <form onSubmit={submit} className="stack">
        <label>
          Spiegel
          <select
            value={mirrorId}
            onChange={(event) => setMirrorId(event.target.value)}
            required
          >
            {mirrors.map((mirror) => (
              <option key={mirror.id} value={mirror.id}>
                {mirror.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Label (optioneel)
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={80}
            placeholder="Eiwekker"
          />
        </label>

        <div className="stack-small">
          <p className="muted">Snelle presets</p>
          <div className="button-row">
            <button
              type="button"
              className="button-secondary"
              onClick={() => startTimer({ seconds: TEST_PRESET_SECONDS })}
              disabled={busy || !mirrorId}
            >
              Test {TEST_PRESET_SECONDS}s
            </button>
          </div>
          <div className="preset-grid">
            {PRESET_MINUTES.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className="button-secondary preset-button"
                onClick={() => startTimer({ minutes })}
                disabled={busy || !mirrorId}
              >
                {minutes}m
              </button>
            ))}
          </div>
        </div>

        <label>
          Handmatig (minuten)
          <input
            type="number"
            min={1}
            max={720}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
            required
          />
        </label>

        <button type="submit" disabled={busy || !mirrorId}>
          {busy ? "Bezig..." : "Start timer"}
        </button>
      </form>

      {status ? <p className="notice success">{status}</p> : null}
      {error ? <p className="notice error">{error}</p> : null}

      <section className="stack-small">
        <h2>Lopende timers</h2>
        {visibleTimers.length === 0 ? (
          <p className="muted">Geen actieve timers op deze spiegel.</p>
        ) : (
          <ul className="timer-list">
            {visibleTimers.map((timer) => (
              <li key={timer.id} className="timer-row">
                <div>
                  <p>{timer.label ?? `Timer ${formatDurationLabel(timer.durationSeconds)}`}</p>
                  <p className="muted">door {timer.requestedBy}</p>
                </div>
                <strong>{formatRemaining(timer.endsAt, nowMs)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
