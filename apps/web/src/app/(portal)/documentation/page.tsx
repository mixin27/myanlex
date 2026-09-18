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
