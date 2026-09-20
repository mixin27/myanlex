import { Skeleton } from '@/components/ui/skeleton';
export default function Loading() {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">Loading workspace…</span>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
