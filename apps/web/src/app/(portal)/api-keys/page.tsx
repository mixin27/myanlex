export default function ApiKeysPage() {
  return (
    <>
      <header className="page-heading">
        <h1>API keys</h1>
        <p>
          Create scoped keys and revoke them without exposing stored secrets.
        </p>
      </header>
      <section className="panel">
        <h2>No API keys yet</h2>
        <p className="muted">
          A new key will be shown once. Only its prefix and SHA-256 hash are
          retained.
        </p>
      </section>
    </>
  );
}
