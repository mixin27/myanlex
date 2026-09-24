import Link from 'next/link';
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-20">
      <p className="mb-5 text-sm font-semibold uppercase tracking-widest text-fd-primary">
        MyanLex / Developer documentation
      </p>
      <h1 className="max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
        Myanmar text.
        <br />
        Explicit contracts.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-fd-muted-foreground">
        Build with Unicode normalization, encoding conversion, written syllables
        and transliteration. Understand the linguistic boundaries before your
        first integration.
      </p>
      <div className="mt-8 flex flex-wrap gap-4">
        <Link
          className="rounded-full bg-fd-primary px-6 py-3 font-medium text-fd-primary-foreground"
          href="/docs/quick-start"
        >
          Make your first request
        </Link>
        <Link
          className="rounded-full border px-6 py-3 font-medium"
          href="/docs/reference"
        >
          Explore the API
        </Link>
      </div>
      <div className="mt-16 grid gap-5 md:grid-cols-3">
        {[
          ['API consumers', 'Integrate without cloning the platform.', '/docs'],
          [
            'Self-hosting',
            'Run your own API and developer console.',
            '/docs/self-hosting',
          ],
          [
            'Contributors',
            'Specifications, corpus provenance and development.',
            '/docs/contributing',
          ],
        ].map(([title, text, href]) => (
          <Link key={href} href={href} className="rounded-2xl border p-6">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-fd-muted-foreground">{text}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
