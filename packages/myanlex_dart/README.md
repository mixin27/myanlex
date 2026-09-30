# myanlex_dart

Typed HTTP SDK for MyanLex language processing. Requires Dart 3.13.1 or newer
within Dart 3, with no Flutter dependency. Uses `package:http` and
`http_parser`.

This is a beta: public contracts may change before a stable release. Passing SDK
tests does not establish linguistic accuracy or independent linguistic review.
The SDK requires a reachable MyanLex API and does not bundle a local NLP engine
or silently fall back to offline processing. Package publication does not imply
that a hosted MyanLex API is available; configure your server's URL explicitly.

## Installation

Use an explicit beta dependency once the version is available on pub.dev:

```yaml
dependencies:
  myanlex_dart: 0.1.0-beta.0
```

Run `dart pub get` to install it. See the Development section for using an
unpublished local checkout instead.

## Usage

```dart
import 'package:myanlex_dart/myanlex_dart.dart';

Future<void> processText(String serverApiKey) async {
  final client = MyanLex(
    apiKey: serverApiKey,
    baseUrl: 'http://localhost:3001/v1',
    timeout: const Duration(seconds: 30),
  );
  try {
    final result = await client.syllabify(text: 'မြန်မာစာ');
    for (final segment in result.segments) {
      print('${segment.start}..${segment.end}: ${segment.text}');
    }
  } on MyanLexApiException catch (error) {
    print('${error.status}: ${error.code}');
  } finally {
    client.close();
  }
}
```

Keep long-lived API keys on a trusted server. Do not embed them in
Flutter/mobile apps or web bundles; those clients should call your authenticated
backend. The library is pure Dart, but browser deployment is not a security
guarantee: browser HTTP implementations control cookies/CORS/redirect handling.
The tested deployment target is the Dart VM. Injected clients must honor abort
and redirect options and must not add cookies, retries, or secret-bearing logs.

## Methods and contracts

- `health()` — no API-key header sent.
- `detect(text: ...)`, `normalize(text: ...)`, `syllabify(text: ...)`,
  `validateOrthography(text: ...)`, `tokenize(text: ...)`.
- `convert(text: ..., from: 'zawgyi', to: 'unicode', validateSource: true)` —
  explicit direction with optional conservative source validation. This rejects
  detected mixed, mismatched or uncertain sources; it does not repair them. Omit
  the flag for backward-compatible unchecked conversion.
- `transliterate(text: ..., scheme: 'ala-lc-2011')` — explicit scheme.
- `batchSyllabify(items: [BatchItem(id: 'a', text: 'က')])`.
- `batchTransliterate(items: [...], scheme: 'ala-lc-2011')`.

Results are typed, with immutable lists and preserved Unicode code-point offsets
(not Dart UTF-16 string indexes). The SDK performs no local normalization or
linguistic processing. Server validation remains authoritative; string codes,
profiles, directions and schemes avoid rejecting future server additions
locally. Malformed required response fields become `invalid_response` failures;
unknown additional response fields are ignored.

Batch results preserve order and expose sealed `BatchSuccess<T>` and
`BatchFailure<T>` variants. Per-item failures in successful HTTP responses are
returned as data, not thrown exceptions.

## Errors and lifecycle

`MyanLexApiException` preserves the HTTP status, optional problem fields,
`code`, `requestId`, and `retryAfterSeconds` (seconds or HTTP-date). Non-JSON
error bodies retain their HTTP status. Problem fields are untrusted server data;
avoid blindly logging them. Exception strings never include keys, submitted
text, raw response bodies, or transport URLs.

`MyanLexRequestException.kind` is `aborted`, `timeout`, `transport_failure`,
`invalid_response`, or `closed`. There are no automatic retries: a timeout or
error can occur after quota reservation, and replay can spend more allowance.
The 30-second default deadline covers headers and the complete body. Timed-out
calls trigger HTTP abortion; injected clients must support abortion to release
their underlying resources. Constructor configuration errors are
`ArgumentError`.

All methods accept `cancellation: token`, where `token` is a
`CancellationToken`. Call `token.cancel()` to cancel one or more requests.
Already-cancelled tokens prevent dispatch. Finished requests remove their
listeners and timers.

Call `close()` when finished: it cancels outstanding calls, rejects future
calls, and closes internally created HTTP clients. An injected `http.Client`
remains caller-owned and is never closed by this SDK.

`baseUrl` includes `/v1` and preserves reverse-proxy path prefixes. HTTPS is
required except on loopback; URLs containing user info, queries, or fragments
are rejected. Redirect following is disabled. The default URL comes from
OpenAPI, not a promise of hosted availability; configure your self-hosted URL
explicitly.

## Development

The package was scaffolded with the official Dart package template. To consume
an unpublished checkout, use a path dependency adjusted to your directory
layout:

```yaml
dependencies:
  myanlex_dart:
    path: ../myanlex/packages/myanlex_dart
```

From this package directory:

```sh
dart pub get
dart format --output=none --set-exit-if-changed lib test example tool
dart analyze --fatal-infos
dart test
```

From the repository root, `pnpm dart:sdk:smoke` builds the API, runs the Dart
client against an ephemeral loopback Nest server, then closes it. This tests all
nine real language routes, code-point offsets, validation, batch failures, and
rate limiting. No development database, hosted API, or browser automation is
used.

`example/myanlex_dart_example.dart` reads `MYANLEX_API_KEY` and optional
`MYANLEX_API_URL` from a server environment. Account/session management,
platform administration, and billing are outside this SDK.
