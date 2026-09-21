/** UTC calendar-month boundaries based on the database clock, not an API clock. */
export function quotaPeriod(now: Date): {
  monthStart: Date;
  resetsAt: Date;
  retryAfterSeconds: number;
} {
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const nextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return {
    monthStart,
    resetsAt: nextMonth,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((nextMonth.getTime() - now.getTime()) / 1_000),
    ),
  };
}
