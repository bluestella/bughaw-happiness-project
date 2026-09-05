"use client";

import * as React from "react";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { Info } from "lucide-react";

/**
 * Styled tooltip. `InfoTip` renders a small "i" icon trigger — the styled
 * replacement for `title=""` hints, which never show on touch devices.
 * Tooltips open on focus too, so the content is keyboard-reachable.
 */
export function InfoTip({ text, label }: { text: string; label?: string }) {
  return (
    <BaseTooltip.Provider delay={300}>
      <BaseTooltip.Root>
        <BaseTooltip.Trigger
          aria-label={label ?? "More info"}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full align-middle text-ink-soft/70 hover:text-coir focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30"
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
        </BaseTooltip.Trigger>
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner sideOffset={6}>
            <BaseTooltip.Popup className="z-50 max-w-[260px] rounded-md border border-line bg-ink px-3 py-2 text-[12px] leading-snug text-white shadow-pop transition-opacity duration-150 ease-out-strong data-[starting-style]:opacity-0 data-[ending-style]:opacity-0">
              {text}
            </BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
  );
}
