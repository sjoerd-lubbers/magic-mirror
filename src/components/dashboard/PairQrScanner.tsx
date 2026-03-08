"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PairQrScannerProps = {
  targetMirrorId?: string;
};

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

function extractClaimToken(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    const claimToken = parsed.searchParams.get("claimToken")?.trim();
    if (claimToken) {
      return claimToken;
    }
  } catch {
    // Geen URL, mogelijk direct token
  }

  if (/^[A-Za-z0-9_-]{16,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function buildPairUrl(claimToken: string, targetMirrorId?: string) {
  const params = new URLSearchParams({
    source: "mirror",
    claimToken,
  });

  if (targetMirrorId) {
    params.set("targetMirrorId", targetMirrorId);
    params.set("autoLink", "1");
  }

  return `/dashboard/pair?${params.toString()}`;
}

export function PairQrScanner({ targetMirrorId }: PairQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [status, setStatus] = useState("Camera starten...");
  const [error, setError] = useState<string | null>(null);
  const [scannerSupported, setScannerSupported] = useState(false);

  const fallbackHint = useMemo(() => {
    return targetMirrorId
      ? "QR detectie niet ondersteund. Plak de koppel-link handmatig; de koppeling gaat dan direct naar deze spiegel."
      : "QR detectie niet ondersteund. Plak de koppel-link handmatig.";
  }, [targetMirrorId]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let interval: number | null = null;

    const start = async () => {
      if (!window.BarcodeDetector) {
        setScannerSupported(false);
        setStatus("Scanner niet beschikbaar op dit toestel.");
        return;
      }

      setScannerSupported(true);
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });

      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) {
        throw new Error("Video element ontbreekt");
      }

      video.srcObject = stream;
      await video.play();
      setStatus("Richt de camera op de QR-code op het scherm.");

      interval = window.setInterval(async () => {
        if (stopped) {
          return;
        }

        const v = videoRef.current;
        const c = canvasRef.current;
        if (!v || !c || v.readyState < 2) {
          return;
        }

        const ctx = c.getContext("2d");
        if (!ctx) {
          return;
        }

        c.width = v.videoWidth;
        c.height = v.videoHeight;
        ctx.drawImage(v, 0, 0, c.width, c.height);

        const detected = await detector.detect(c);
        const raw = detected[0]?.rawValue ?? "";
        const claimToken = extractClaimToken(raw);

        if (!claimToken) {
          return;
        }

        setStatus("QR gescand. Doorsturen...");
        window.location.href = buildPairUrl(claimToken, targetMirrorId);
      }, 350);
    };

    start().catch((startError) => {
      setError(startError instanceof Error ? startError.message : "Camera kon niet starten.");
      setStatus("Camera niet beschikbaar.");
    });

    return () => {
      stopped = true;
      if (interval) {
        window.clearInterval(interval);
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [targetMirrorId]);

  return (
    <section className="card stack-small">
      <h2>Scan QR-code</h2>
      <p className="muted">{status}</p>

      {scannerSupported ? (
        <div className="qr-scanner-frame">
          <video ref={videoRef} className="qr-scanner-video" muted playsInline />
          <canvas ref={canvasRef} className="qr-scanner-canvas" />
        </div>
      ) : (
        <p className="muted">{fallbackHint}</p>
      )}

      <label>
        Koppel-link of claim token
        <input
          value={manualInput}
          onChange={(event) => setManualInput(event.target.value)}
          placeholder="Plak link of token"
        />
      </label>
      <div>
        <button
          type="button"
          className="button-secondary"
          onClick={() => {
            const claimToken = extractClaimToken(manualInput);
            if (!claimToken) {
              setError("Geen geldige claim-token gevonden.");
              return;
            }

            window.location.href = buildPairUrl(claimToken, targetMirrorId);
          }}
        >
          Gebruik ingevoerde token
        </button>
      </div>

      {error ? <p className="notice error">{error}</p> : null}
    </section>
  );
}
