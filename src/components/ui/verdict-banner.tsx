import { Check, X } from "lucide-react";
import { cn } from "@/lib/cn";

/** Pass/fail summary banner under calculator outputs. */
export function VerdictBanner({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-5 py-3.5 text-sm font-medium",
        ok
          ? "border-success-border bg-success-bg text-success"
          : "border-danger-border bg-danger-bg text-danger"
      )}
    >
      {ok ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      )}
      <span>{children}</span>
    </div>
  );
}
