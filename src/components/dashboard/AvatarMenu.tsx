"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type AvatarMenuProps = {
  displayName: string | null;
  email: string;
};

function avatarInitials(displayName: string | null, email: string) {
  const normalizedName = displayName?.trim() ?? "";
  if (normalizedName) {
    const words = normalizedName.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      const first = words[0]?.[0] ?? "";
      const last = words[words.length - 1]?.[0] ?? "";
      return `${first}${last}`.toUpperCase();
    }

    return normalizedName.slice(0, 2).toUpperCase();
  }

  const localPart = email.split("@")[0] ?? email;
  const localWords = localPart
    .split(/[._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (localWords.length >= 2) {
    const first = localWords[0]?.[0] ?? "";
    const last = localWords[localWords.length - 1]?.[0] ?? "";
    return `${first}${last}`.toUpperCase();
  }

  return localPart.slice(0, 2).toUpperCase();
}

export function AvatarMenu({ displayName, email }: AvatarMenuProps) {
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (!menu || !menu.open) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !menu.contains(target)) {
        menu.open = false;
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      const menu = menuRef.current;
      if (menu?.open) {
        menu.open = false;
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, []);

  return (
    <details ref={menuRef} className="avatar-menu">
      <summary className="avatar-trigger" aria-label="Account menu">
        <span className="avatar-badge">{avatarInitials(displayName, email)}</span>
      </summary>

      <div className="avatar-dropdown">
        <p className="avatar-name">{displayName?.trim() || "Geen naam ingesteld"}</p>
        <p className="muted avatar-email">{email}</p>

        <div className="avatar-actions">
          <Link href="/dashboard/profile" className="button-link button-secondary button-small">
            Profiel
          </Link>
          <button
            type="button"
            disabled={busy}
            className="button-secondary button-small"
            onClick={async () => {
              setBusy(true);
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            {busy ? "Uitloggen..." : "Uitloggen"}
          </button>
        </div>
      </div>
    </details>
  );
}
