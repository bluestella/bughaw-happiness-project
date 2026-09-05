"use client";

import * as React from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cn } from "@/lib/cn";

/**
 * Animated dialog wrapper around Base UI. Backdrop fades, popup scales
 * 0.96 → 1 with the strong ease-out; exit is faster than enter. Movement is
 * disabled under prefers-reduced-motion (opacity still animates).
 */
export const Dialog = BaseDialog;

export function DialogBackdrop({ className }: { className?: string }) {
  return (
    <BaseDialog.Backdrop
      className={cn(
        "fixed inset-0 z-40 bg-ink/40 transition-opacity duration-200 ease-out-strong",
        "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-150",
        className
      )}
    />
  );
}

export function DialogPopup({
  className,
  children,
  unpadded = false,
}: {
  className?: string;
  children: React.ReactNode;
  /** Skip the default p-5 so sections can manage their own padding. */
  unpadded?: boolean;
}) {
  return (
    <BaseDialog.Popup
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
        "rounded-xl border border-line bg-panel shadow-pop",
        !unpadded && "p-5",
        "origin-center transition-[opacity,transform] duration-200 ease-out-strong",
        "data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0",
        "data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[ending-style]:duration-150",
        "motion-reduce:data-[starting-style]:scale-100 motion-reduce:data-[ending-style]:scale-100",
        className
      )}
    >
      {children}
    </BaseDialog.Popup>
  );
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
  return (
    <BaseDialog.Title className="text-base font-semibold text-ink">
      {children}
    </BaseDialog.Title>
  );
}

export function DialogDescription({ children }: { children: React.ReactNode }) {
  return (
    <BaseDialog.Description className="mt-1.5 text-[13px] text-ink-soft">
      {children}
    </BaseDialog.Description>
  );
}

export function DialogClose({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <BaseDialog.Close
      className={cn(
        "rounded-md border border-line bg-white px-3 py-1.5 text-[12px] font-semibold text-ink shadow-card transition-colors hover:border-ink-soft focus:outline-none focus-visible:border-coir focus-visible:ring-2 focus-visible:ring-coir/30",
        className
      )}
    >
      {children}
    </BaseDialog.Close>
  );
}
