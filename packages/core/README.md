# @myanlex/core

Unpublished developer preview. Framework-independent Myanmar text processing for
JavaScript runtimes. Models and rule tables are bundled: runtime processing
needs no API, account, database, remote model download, or API quota.

For most integrations use `@myanlex/application`, which adds validated input
limits, guarded conversion and batch operations. This lower-level package
exposes algorithms and types; callers are responsible for appropriate input
policy.

```ts
import { normalizeUnicode, segmentBurmeseSyllables } from '@myanlex/core';

const normalized = normalizeUnicode('ဦ');
const segments = segmentBurmeseSyllables(normalized.output);
```

Exports include detection, explicit encoding conversion, NFC normalization,
written-syllable segmentation, structural orthography validation, mechanical
ALA-LC transliteration, and syllable/script tokenization. These are not spelling
repair, dictionary word segmentation, pronunciation, or automatic mixed-encoding
repair.

ESM only; declarations are included. Use a worker for substantial browser
processing. An application must deliver/cache its own assets to support offline
page loading. NFC uses the runtime's Unicode implementation; matching packages
alone do not prove equivalence across arbitrary Unicode/runtime versions.

See
[publishing and compatibility](https://github.com/mixin27/myanlex/blob/main/docs/publishing.md).
Offsets use Unicode code points and refer to the exact analyzed text.
Independent linguistic review and broader conformance evaluation remain
outstanding.

Project code is MIT licensed. Adapted components/data retain their own licenses;
redistributors must retain THIRD_PARTY_NOTICES.md and the bundled license texts.
