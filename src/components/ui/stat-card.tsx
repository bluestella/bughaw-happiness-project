import { cn } from "@/lib/cn";

/** KPI tile: uppercase mono label over a large numeric value. */
export function StatCard({
  label,
  value,
  note,
  emphasis = false,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
  emphasis?: boolean;
  /** Overrides the value color for status-bearing numbers. */
  tone?: "success" | "danger" | "amber";
  className?: string;
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-danger"
        : tone === "amber"
          ? "text-amber"
          : emphasis
            ? "text-coir-dark"
            : "text-ink";
  return (
    <div
      className={cn(
        "rounded-xl border p-5 shadow-card",
        emphasis ? "border-coir/25 bg-coir-bg" : "border-line bg-panel",
        className
      )}
    >
      <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-soft">
        {label}
      </p>
      <p
        className={cn(
          "font-semibold tabular-nums",
          emphasis ? "text-[26px]" : "text-[22px]",
          toneClass
        )}
      >
        {value}
      </p>
      {note && <p className="mt-1.5 text-[11px] text-ink-soft">{note}</p>}
    </div>
  );
}
