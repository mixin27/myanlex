'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section role="alert" className="space-y-4">
      <h1>Unable to load your workspace</h1>
      <p>
        Please try again. If the problem continues, check that the API and
        database are running.
      </p>
      <Button onClick={reset}>Try again</Button>
    </section>
  );
}
