"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <div aria-live="polite" aria-atomic="true" aria-relevant="additions">
      <Toaster
        position="top-right"
        closeButton
        richColors
        toastOptions={{
          classNames: {
            closeButton:
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/40",
          },
        }}
      />
    </div>
  );
}

export function announce(message: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById("aria-live-announcer");
  if (!el) return;
  el.textContent = "";
  requestAnimationFrame(() => {
    el.textContent = message;
  });
}

