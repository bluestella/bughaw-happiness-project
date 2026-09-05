"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";

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
        <DialogBackdrop />
        <DialogPopup>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose>Cancel</DialogClose>
            <Button intent="danger" size="sm" disabled={confirming} onClick={confirm}>
              {confirming ? "Deleting…" : confirmLabel ?? "Delete"}
            </Button>
          </div>
        </DialogPopup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
