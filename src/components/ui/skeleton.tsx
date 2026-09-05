import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-line/60", className)}
    />
  );
}

/** A card-shaped skeleton matching the standard panel layout. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5 shadow-card">
      <Skeleton className="mb-3 h-3 w-24" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="mb-2 h-4 last:mb-0" />
      ))}
    </div>
  );
}
