"use client";

import { toast } from "sonner";

/** Public base URL: NEXT_PUBLIC_SITE_URL when it is a real https origin, else this tab's origin. */
export function shareBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured && configured.startsWith("https://")) return configured;
  return typeof window === "undefined" ? "" : window.location.origin;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied.`);
  } catch {
    toast.error("Copy failed — select the text and copy it manually.");
  }
}
