"use client";

import { useState } from "react";

type MirrorSettingsCopyButtonProps = {
  mirrorId: string;
};

export function MirrorSettingsCopyButton({ mirrorId }: MirrorSettingsCopyButtonProps) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleCopy() {
    setBusy(true);
    setStatus(null);

    try {
      const response = await fetch(`/api/mirrors/${mirrorId}/settings-export`, {
        cache: "no-store",
      });

      if (!response.ok) {
        setStatus("Kopieren mislukt.");
        return;
      }

      const json = (await response.text()).trim();

      if (!navigator.clipboard) {
        setStatus("Clipboard API niet beschikbaar.");
        return;
      }

      await navigator.clipboard.writeText(json);
      setStatus("Settings staan in je klembord.");
    } catch {
      setStatus("Kopieren mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-copy-wrap">
      <button
        type="button"
        className="button-secondary button-small"
        onClick={handleCopy}
        disabled={busy}
      >
        {busy ? "Kopieren..." : "Kopieer settings"}
      </button>
      {status ? <p className="muted inline-copy-status">{status}</p> : null}
    </div>
  );
}
