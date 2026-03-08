"use client";

import { useEffect } from "react";
import {
  MIRROR_CLAIM_STORAGE_KEY,
  MIRROR_ID_STORAGE_KEY,
} from "@/lib/mirror-device";

export default function MirrorNotFoundPage() {
  useEffect(() => {
    window.localStorage.removeItem(MIRROR_ID_STORAGE_KEY);
    window.localStorage.removeItem(MIRROR_CLAIM_STORAGE_KEY);
    window.location.replace("/mirror/register?error=mirror_missing");
  }, []);

  return (
    <main className="center-page">
      <div className="card card-narrow">
        <h1>Spiegel niet gevonden</h1>
        <p className="muted">Koppeling wordt vernieuwd...</p>
      </div>
    </main>
  );
}
