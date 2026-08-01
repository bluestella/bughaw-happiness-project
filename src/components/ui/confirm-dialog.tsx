"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
}) {
  const [confirming, setConfirming] = useState(false);

  async function confirm() {
    setConfirming(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-ink/40 z-50" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-paper border border-line rounded-xl w-[calc(100vw-2rem)] max-w-md p-5 z-50">
          <Dialog.Title className="font-display text-base font-semibold text-ink">
            {title}
          </Dialog.Title>
          {description && (
            <Dialog.Description className="text-[13px] text-ink-soft mt-2">
              {description}
            </Dialog.Description>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <Dialog.Close className="text-[12px] px-3 py-1.5 rounded-md font-semibold transition-colors border bg-white text-ink border-line hover:border-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30 focus-visible:border-coir">
              Cancel
            </Dialog.Close>
            <Button intent="danger" size="sm" disabled={confirming} onClick={confirm}>
              {confirming ? "Deleting…" : confirmLabel ?? "Delete"}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
