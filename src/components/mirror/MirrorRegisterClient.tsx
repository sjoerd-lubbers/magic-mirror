"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MIRROR_CLAIM_STORAGE_KEY,
  MIRROR_ID_STORAGE_KEY,
} from "@/lib/mirror-device";

type SessionInitPayload = {
  ok: boolean;
  status: "pending";
  token: string;
  expiresAt: string;
  pairUrl: string;
  qrDataUrl: string;
};

type SessionStatusPayload = {
  ok: boolean;
  status: "pending" | "claimed" | "expired";
  mirrorId?: string;
};

function formatExpiresAt(value: string) {
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(asDate);
}

export function MirrorRegisterClient() {
  const [busy, setBusy] = useState(true);
  const [token, setToken] = useState("");
  const [pairUrl, setPairUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function init() {
      setBusy(true);
      setError(null);
      const storedClaimToken = window.localStorage
        .getItem(MIRROR_CLAIM_STORAGE_KEY)
        ?.trim();

      const response = await fetch("/api/mirror/device/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: storedClaimToken || undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as SessionInitPayload | null;

      if (ignore) {
        return;
      }

      if (!response.ok || !payload?.ok) {
        setError("Kon koppelsessie niet starten. Vernieuw de pagina.");
        setBusy(false);
        return;
      }

      setToken(payload.token);
      setPairUrl(payload.pairUrl);
      setQrDataUrl(payload.qrDataUrl);
      setExpiresAt(payload.expiresAt);
      window.localStorage.setItem(MIRROR_CLAIM_STORAGE_KEY, payload.token);
      setBusy(false);
    }

    init().catch(() => {
      if (!ignore) {
        setError("Kon koppelsessie niet starten. Vernieuw de pagina.");
        setBusy(false);
      }
    });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!token || activating) {
      return;
    }

    let stopped = false;

    const poll = async () => {
      const response = await fetch(
        `/api/mirror/device/session?token=${encodeURIComponent(token)}`,
        {
          cache: "no-store",
        },
      );
      const payload = (await response.json().catch(() => null)) as SessionStatusPayload | null;

      if (stopped || !payload?.ok) {
        return;
      }

      if (payload.status === "claimed" && payload.mirrorId) {
        setActivating(true);
        const activateResponse = await fetch("/api/mirror/device/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const activatePayload = (await activateResponse.json().catch(() => null)) as
          | { ok?: boolean; mirrorId?: string; redirectTo?: string }
          | null;

        if (activateResponse.ok && activatePayload?.ok && activatePayload.redirectTo) {
          if (activatePayload.mirrorId) {
            window.localStorage.setItem(MIRROR_ID_STORAGE_KEY, activatePayload.mirrorId);
          }
          window.localStorage.removeItem(MIRROR_CLAIM_STORAGE_KEY);
          window.location.href = activatePayload.redirectTo;
          return;
        }

        setError("Spiegel is gekoppeld, maar activeren lukte niet. Vernieuw de pagina.");
        setActivating(false);
        return;
      }

      if (payload.status === "expired") {
        window.localStorage.removeItem(MIRROR_CLAIM_STORAGE_KEY);
        setError("Koppelsessie verlopen. Vernieuw de pagina voor een nieuwe QR-code.");
      }
    };

    poll().catch(() => undefined);
    const interval = window.setInterval(() => {
      poll().catch(() => undefined);
    }, 2000);

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [token, activating]);

  const expiresAtLabel = useMemo(() => {
    return expiresAt ? formatExpiresAt(expiresAt) : null;
  }, [expiresAt]);

  return (
    <div className="card card-narrow stack">
      <h1>Spiegel koppelen</h1>
      <p>Scan de QR-code met je telefoon om deze spiegel direct te registreren.</p>

      {busy ? <p className="muted">QR-code laden...</p> : null}

      {!busy && qrDataUrl ? (
        <div className="pairing-panel stack-small">
          <div className="pairing-qr-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR voor spiegel koppeling" className="qr-image" />
          </div>
          <details className="pair-link-disclosure">
            <summary>Toon koppel-link</summary>
            <p className="muted pair-link-text">{pairUrl}</p>
          </details>
          {expiresAtLabel ? (
            <p className="muted">Deze sessie is geldig tot {expiresAtLabel}.</p>
          ) : null}
          <p className="muted">Na bevestiging op je telefoon gaat deze spiegel automatisch verder.</p>
        </div>
      ) : null}

      {activating ? <p className="notice success">Koppeling ontvangen. Spiegel wordt geopend...</p> : null}
      {error ? <p className="notice error">{error}</p> : null}
    </div>
  );
}
