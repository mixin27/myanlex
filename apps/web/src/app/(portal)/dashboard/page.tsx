export default function DashboardPage() {
  return (
    <>
      <header className="page-heading">
        <h1>Dashboard</h1>
        <p>Your MyanLex developer workspace at a glance.</p>
      </header>
      <section className="card-grid" aria-label="Usage overview">
        <article className="card">
          <span>Requests today</span>
          <strong>0</strong>
        </article>
        <article className="card">
          <span>Characters processed</span>
          <strong>0</strong>
        </article>
        <article className="card">
          <span>Errors</span>
          <strong>0</strong>
        </article>
        <article className="card">
          <span>Current plan</span>
          <strong>Free</strong>
        </article>
      </section>
      <section className="panel">
        <h2>API usage</h2>
        <p className="muted">
          Usage will appear after a project API key makes its first request.
        </p>
      </section>
    </>
  );
}
