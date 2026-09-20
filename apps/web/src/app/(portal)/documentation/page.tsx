const apiDocsUrl =
  process.env.NEXT_PUBLIC_API_DOCS_URL ?? 'http://localhost:3000/docs';

export default function DocumentationPage() {
  return (
    <>
      <header className="page-heading">
        <h1>Documentation</h1>
        <p>Explore and test the authoritative MyanLex OpenAPI contract.</p>
      </header>
      <section className="panel">
        <h2>Organization and project API</h2>
        <p>
          Sign in, open the reference, and select the same-origin /v1 server to
          test platform routes using your session.
        </p>
        <p>
          <a className="button" href="/api-reference">
            Open session-enabled Scalar reference
          </a>
        </p>
      </section>
      <section className="panel">
        <h2>Interactive API reference</h2>
        <p className="muted">
          Scalar includes request examples and a built-in API client.
        </p>
        <p>
          <a className="button" href={apiDocsUrl}>
            Open Scalar API reference
          </a>
        </p>
      </section>
    </>
  );
}
