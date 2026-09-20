import { ArrowUpRight, BookOpen, KeyRound } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
const apiDocsUrl =
  process.env.NEXT_PUBLIC_API_DOCS_URL ?? 'http://localhost:3001/docs';

export default function DocumentationPage() {
  return (
    <>
      <header className="page-heading">
        <h1>Documentation</h1>
        <p>Explore and test the authoritative MyanLex OpenAPI contract.</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-6">
          <BookOpen className="mb-6 size-6 text-emerald-800" />
          <h2 className="font-semibold">Platform API</h2>
          <p className="my-4 text-sm leading-6 text-muted-foreground">
            Sign in, open the reference, and select the same-origin /v1 server
            to test platform routes using your session.
          </p>
          <p>
            <a className={buttonVariants()} href="/api-reference">
              Open platform reference <ArrowUpRight className="size-4" />
            </a>
          </p>
        </section>
        <section className="rounded-xl border bg-white p-6">
          <KeyRound className="mb-6 size-6 text-emerald-800" />
          <h2 className="font-semibold">Language API</h2>
          <p className="my-4 text-sm leading-6 text-muted-foreground">
            Explore language operations, request examples, and response
            contracts. Use a scoped project API key to send authenticated
            requests in Scalar.
          </p>
          <p>
            <a
              className={buttonVariants({ variant: 'outline' })}
              href={apiDocsUrl}
            >
              Open language reference <ArrowUpRight className="size-4" />
            </a>
          </p>
        </section>
      </div>
    </>
  );
}
