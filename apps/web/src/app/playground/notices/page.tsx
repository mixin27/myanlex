import Link from 'next/link';

export const metadata = { title: 'Playground engine notices' };
export default function EngineNotices() {
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-8">
      <Link href="/playground" className="underline">
        Back to playground
      </Link>
      <h1 className="text-2xl font-semibold">
        Engine licenses and third-party notices
      </h1>
      <p>
        MyanLex project code is MIT licensed. The browser worker includes the
        following adapted components and data; their original licenses remain
        applicable.
      </p>
      <h2 className="font-semibold">
        Google Myanmar Tools detector and converter
      </h2>
      <p>
        The compiled engine adapts the Zawgyi detector, trained model,
        conversion engine and CLDR-derived generated rules from Google Myanmar
        Tools 1.2.0. Copyright 2017 Google LLC. Adapted components and bundled
        model remain subject to Apache License 2.0.
      </p>
      <p>
        <a className="underline" href="https://github.com/google/myanmar-tools">
          Upstream source
        </a>{' '}
        ·{' '}
        <a
          className="underline"
          href="https://www.apache.org/licenses/LICENSE-2.0"
        >
          Apache License 2.0
        </a>
      </p>
      <h2 className="font-semibold">Unicode Character Database</h2>
      <p>
        The compiled engine includes a range table derived from Unicode 17.0.0
        emoji-data.txt. Copyright © 1991–2025 Unicode, Inc. All rights reserved.
        Distributed under the Unicode License v3.
      </p>
      <a className="underline" href="https://www.unicode.org/license.txt">
        Unicode License v3
      </a>
      <p className="text-sm text-muted-foreground">
        Playground examples are project-authored synthetic examples, MIT
        licensed. They do not constitute independent linguistic review.
      </p>
    </main>
  );
}
