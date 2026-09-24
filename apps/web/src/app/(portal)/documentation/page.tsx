import { documentationUrl } from '@/lib/documentation';

export default function DocumentationPage() {
  return (
    <>
      <header className="page-heading">
        <h1>Documentation</h1>
        <p>Guides live on the dedicated MyanLex documentation site.</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-6">
          <h2 className="font-semibold">Developer guides</h2>
          <p className="my-4 text-sm text-muted-foreground">
            Quick start, language operations, SDKs, errors and quotas. No
            console login is needed to read the docs.
          </p>
          <a
            className="font-medium underline"
            href={`${documentationUrl}/docs/quick-start`}
          >
            Open developer documentation
          </a>
        </section>
        <section className="rounded-xl border bg-card p-6">
          <h2 className="font-semibold">Platform API testing</h2>
          <p className="my-4 text-sm text-muted-foreground">
            Use this console&apos;s same-origin /v1 server with your verified
            session for organization, project and key operations.
          </p>
          <a className="font-medium underline" href="/api-reference">
            Open session-enabled Scalar
          </a>
        </section>
      </div>
    </>
  );
}
