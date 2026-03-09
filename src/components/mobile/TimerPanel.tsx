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

type PushPublicKeyResponse = {
  enabled?: boolean;
  publicKey?: string | null;
};

const PRESET_MINUTES = [3, 6, 10, 15, 20, 25, 30, 40, 50, 60] as const;
const TEST_PRESET_SECONDS = 10;

function base64UrlToUint8Array(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob(`${base64}${padding}`);
  const output = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
}

async function getServiceWorkerRegistration() {
  await navigator.serviceWorker.register("/sw.js");
  const ready = await navigator.serviceWorker.ready;
  return ready;
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Onbekende fout";
}

function toPushSubscribeHint(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("push service error")) {
    return "Push service niet bereikbaar. Gebruik bij Brave: zet 'Use Google services for push messaging' aan (brave://settings/privacy). Schakel shields/adblock/VPN kort uit en probeer opnieuw.";
  }

  if (normalized.includes("notallowederror")) {
    return "Browser meldingstoestemming is geblokkeerd. Zet notificaties voor localhost op Toestaan.";
  }

  return message;
}

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
  const [pushSupported, setPushSupported] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushPublicKey, setPushPublicKey] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);

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

  const loadPushState = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setPushSupported(false);
      setPushConfigured(false);
      setPushSubscribed(false);
      return;
    }

    const response = await fetch("/api/push/public-key", {
      cache: "no-store",
    });

    if (!response.ok) {
      setPushSupported(false);
      setPushConfigured(false);
      setPushSubscribed(false);
      return;
    }

    const payload = (await response.json().catch(() => null)) as PushPublicKeyResponse | null;
    const configured = Boolean(payload?.enabled && payload.publicKey);
    setPushConfigured(configured);
    setPushPublicKey(payload?.publicKey ?? null);

    if (!configured) {
      setPushSubscribed(false);
      return;
    }

    const registration = await getServiceWorkerRegistration();
    const existingSubscription = await registration.pushManager.getSubscription();
    setPushSubscribed(Boolean(existingSubscription));
  }, []);

  useEffect(() => {
    loadPushState().catch(() => undefined);
  }, [loadPushState]);

  async function enablePushNotifications() {
    if (!pushPublicKey || !pushConfigured) {
      return;
    }

    setPushBusy(true);
    setPushError(null);
    setPushStatus(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushError("Toon meldingen toestaan in je browser om push te gebruiken.");
        setPushBusy(false);
        return;
      }

      const registration = await getServiceWorkerRegistration();
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(pushPublicKey),
        });
      }

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setPushError("Push subscription kon niet worden opgeslagen.");
        setPushBusy(false);
        return;
      }

      const response = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (payload?.error) {
          setPushError(payload.error);
          setPushBusy(false);
          return;
        }

        const responseText = (await response.text().catch(() => "")).trim();
        setPushError(responseText || `Push activeren mislukt (HTTP ${response.status}).`);
        setPushBusy(false);
        return;
      }

      setPushSubscribed(true);
    } catch (error) {
      setPushError(`Push activeren mislukt: ${toPushSubscribeHint(formatErrorMessage(error))}`);
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePushNotifications() {
    if (!pushSupported) {
      return;
    }

    setPushBusy(true);
    setPushError(null);
    setPushStatus(null);

    try {
      const registration = await getServiceWorkerRegistration();
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch("/api/push/subscriptions", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
          }),
        });

        await subscription.unsubscribe().catch(() => undefined);
      }

      setPushSubscribed(false);
    } catch (error) {
      setPushError(`Push uitzetten mislukt: ${formatErrorMessage(error)}`);
    } finally {
      setPushBusy(false);
    }
  }

  async function sendTestPush() {
    setPushBusy(true);
    setPushError(null);
    setPushStatus(null);

    try {
      const response = await fetch("/api/push/test", {
        method: "POST",
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            result?: {
              sent?: number;
              failed?: number;
              removed?: number;
              skipped?: boolean;
            };
          }
        | null;

      if (!response.ok || !payload?.ok) {
        setPushError(payload?.error ?? `Test push mislukt (HTTP ${response.status})`);
        return;
      }

      const sent = payload.result?.sent ?? 0;
      const failed = payload.result?.failed ?? 0;
      const skipped = payload.result?.skipped ?? false;

      if (skipped) {
        setPushError("Test push overgeslagen: server push-config ontbreekt.");
        return;
      }

      setPushStatus(`Test push verstuurd. sent=${sent}, failed=${failed}`);
    } catch (error) {
      setPushError(`Test push mislukt: ${formatErrorMessage(error)}`);
    } finally {
      setPushBusy(false);
    }
  }

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
    <div className="timer-panel stack">
      <div className="stack-small">
        <h1>Timer zetten</h1>
        <p>Snelle timerbediening.</p>
      </div>

      <section className="card stack-small">
        <h2>Pushmeldingen</h2>
        {!pushSupported ? (
          <p className="muted">Push wordt niet ondersteund in deze browser.</p>
        ) : !pushConfigured ? (
          <p className="muted">Push is nog niet geconfigureerd op de server.</p>
        ) : (
          <>
            <p className="muted">Ontvang een melding zodra jouw timer klaar is.</p>
            <div className="button-row">
              {pushSubscribed ? (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={disablePushNotifications}
                  disabled={pushBusy}
                >
                  {pushBusy ? "Bezig..." : "Push uitzetten"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={enablePushNotifications}
                  disabled={pushBusy}
                >
                  {pushBusy ? "Bezig..." : "Push aanzetten"}
                </button>
              )}
              <button
                type="button"
                className="button-secondary"
                onClick={sendTestPush}
                disabled={pushBusy || !pushSubscribed}
              >
                {pushBusy ? "Bezig..." : "Test push"}
              </button>
            </div>
          </>
        )}
        {pushStatus ? <p className="notice success">{pushStatus}</p> : null}
        {pushError ? <p className="notice error">{pushError}</p> : null}
      </section>

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
