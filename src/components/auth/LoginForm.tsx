"use client";

import { FormEvent, useState } from "react";

type Step = "request" | "verify";

export function LoginForm() {
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/auth/request-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setBusy(false);

    const payload = (await response.json().catch(() => null)) as
      | {
          ok?: boolean;
          error?: string;
          warning?: string;
          debug?: {
            code?: string;
            smtpHostUsed?: string;
          };
        }
      | null;

    if (!response.ok || !payload?.ok) {
      setError(payload?.error ?? "Kon code niet versturen");
      return;
    }

    setStep("verify");
    if (payload.warning || payload.debug?.code) {
      setMessage(
        payload.warning ??
          `SMTP fallback actief. Gebruik tijdelijk deze code: ${payload.debug?.code}.`,
      );
      return;
    }

    const hostInfo = payload.debug?.smtpHostUsed
      ? ` (SMTP host: ${payload.debug.smtpHostUsed})`
      : "";
    setMessage(`Code verstuurd. Check MailHog op http://localhost:8025.${hostInfo}`);
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/auth/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });

    setBusy(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Code verificatie mislukt");
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <div className="card card-narrow">
      <h1>Inloggen</h1>
      <p>Login met e-mail + code.</p>

      {step === "request" ? (
        <form onSubmit={requestCode} className="stack">
          <label>
            E-mail
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="naam@voorbeeld.nl"
            />
          </label>

          <button type="submit" disabled={busy}>
            {busy ? "Versturen..." : "Stuur code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="stack">
          <label>
            Code
            <input
              inputMode="numeric"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
            />
          </label>

          <button type="submit" disabled={busy}>
            {busy ? "Controleren..." : "Log in"}
          </button>

          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setStep("request");
              setCode("");
            }}
          >
            Ander e-mailadres
          </button>
        </form>
      )}

      {message ? <p className="notice success">{message}</p> : null}
      {error ? <p className="notice error">{error}</p> : null}
    </div>
  );
}
