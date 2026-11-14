import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

/**
 * Shown the moment a link is clicked, while the next page's server data loads.
 * Every page here is dynamic (auth + RLS), so without this the old page stays
 * on screen with no feedback until the new one is ready.
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="mb-8 h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </div>
    </div>
  );
}
