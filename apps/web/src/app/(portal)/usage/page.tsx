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
        <h2>No usage recorded</h2>
        <p className="muted">
          Select a project after its first authenticated request.
        </p>
      </section>
    </>
  );
}
