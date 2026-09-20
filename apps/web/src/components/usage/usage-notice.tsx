export function UsageNotice() {
  return (
    <p className="rounded-lg bg-muted/50 p-4 text-xs leading-5 text-muted-foreground">
      Recorded usage is best-effort, not a billing statement. Bootstrap-key
      traffic and requests rejected before the handler (including rate limits)
      are excluded. Persistence failures can leave gaps. Batch requests count
      once; item-level errors in successful batches are not HTTP errors.
      Submitted text is never stored in usage records.
    </p>
  );
}
