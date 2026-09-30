# @myanlex/application

Unpublished developer preview. The recommended local-processing entry point for
MyanLex: framework-independent services calling `@myanlex/core`, with input
validation, limits, optional guarded conversion and per-item batch failures.

```ts
import { createMyanLexApplication } from '@myanlex/application';

const myanlex = createMyanLexApplication();
const normalized = myanlex.normalizeText({ text: 'ဦ' });
const syllables = myanlex.syllabifyText({ text: normalized.output });
```

All nine current language operations execute locally. No API key, server,
account, network request, database or quota reservation is involved. Use a
browser worker for substantial input; this package does not supply worker
lifecycle management, storage, telemetry, automatic API fallback, or a service
worker/PWA.

Methods: `detectText`, `normalizeText`, `convertText`, `syllabifyText`,
`validateOrthography`, `transliterateText`, `tokenizeText`, `batchSyllabify`,
and `batchTransliterate`. Pass an explicit transliteration scheme
(`ala-lc-2011`). Use `validateSource: true` with explicit conversion directions
for untrusted text; omission preserves the existing unchecked behavior for
compatibility. Mixed and uncertain inputs can be rejected; no automatic repair
is performed.

Defaults: 100,000 code points per text, 1,000 batch items, and 1,000,000
aggregate UTF-8 text bytes. These resource bounds are not performance
guarantees. Offsets refer to the exact input of an operation and use Unicode
code points.

ESM and declarations are included. No CommonJS build or native Python/Dart
engine is supplied. See
[package distribution](https://github.com/mixin27/myanlex/blob/main/docs/publishing.md).
Runtime Unicode differences require conformance testing; independent linguistic
review remains outstanding. Project code is MIT licensed; preserve the core
dependency's third-party notices and license texts when bundling.
