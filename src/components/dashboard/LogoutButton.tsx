"use client";

import { useState } from "react";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);

  return (
    <button
      disabled={busy}
      className="button-secondary"
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login";
      }}
    >
      {busy ? "Uitloggen..." : "Uitloggen"}
    </button>
  );
}
