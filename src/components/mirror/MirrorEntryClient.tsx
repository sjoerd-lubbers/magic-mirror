"use client";

import { useEffect } from "react";
import { MIRROR_ID_STORAGE_KEY } from "@/lib/mirror-device";

export function MirrorEntryClient() {
  useEffect(() => {
    const fromStorage = window.localStorage.getItem(MIRROR_ID_STORAGE_KEY)?.trim();

    if (fromStorage) {
      window.location.replace(`/mirror/${encodeURIComponent(fromStorage)}`);
      return;
    }

    window.location.replace("/mirror/register");
  }, []);

  return (
    <div className="card card-narrow">
      <h1>Spiegel laden</h1>
      <p className="muted">Bezig met openen van de juiste spiegel...</p>
    </div>
  );
}
