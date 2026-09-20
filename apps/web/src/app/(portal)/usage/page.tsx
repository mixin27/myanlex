export default function UsagePage() {
  return (
    <>
      <header className="page-heading">
        <h1>Usage</h1>
        <p>
          Requests, errors, characters, and processing time without stored input
          text.
        </p>
      </header>
      <section className="panel">
        <h2>Usage reporting is coming next</h2>
        <p className="muted">
          Requests are metered by the API, but aggregated reporting is not yet
          available in this console. This is not an indication of zero usage.
        </p>
      </section>
    </>
  );
}
