"use client";

import { useEffect } from "react";
import { parseClickTarget } from "@/lib/cards";

/**
 * Counts clicks on `[data-track]` links inside the card with a fire-and-forget
 * beacon, so navigation is never delayed. The server re-validates everything.
 */
export function CardClickTracker({ token, source }: { token: string; source: string }) {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = (e.target as Element | null)?.closest?.("[data-track]");
      const target = parseClickTarget(el?.getAttribute("data-track"));
      if (!target) return;
      const body = JSON.stringify({ target, source });
      const url = `/c/${token}/event`;
      try {
        if (!navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) {
          void fetch(url, {
            method: "POST",
            body,
            headers: { "content-type": "application/json" },
            keepalive: true,
          });
        }
      } catch {
        // Analytics must never interfere with the visitor.
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [token, source]);

  return null;
}
