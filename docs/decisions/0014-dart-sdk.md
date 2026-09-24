# ADR 0014: Official Dart package scaffold and thin HTTP SDK

Status: accepted.

Use `dart create --template=package` for `packages/myanlex_dart`, retaining the
standard lib/src, test, example, analysis options, pubspec, and changelog
layout. The installed stable Dart 3.13.1 sets the initial minimum. Use
compatible current `http` and `http_parser` packages without Flutter or
framework dependencies.

Match the TypeScript SDK's nine language/batch operations, typed errors,
explicit encoding direction/scheme, no retries, and code-point offsets. Decode
typed immutable response models; keep forward-compatible string codes. Do not
duplicate linguistic rules or normalize input. Add cancellation tokens with
listener cleanup, deadlines covering response bodies, and explicit
owned/borrowed client lifecycle.

Use abortable HTTP requests and disable redirects. Require HTTPS except
loopback. Do not expose secrets through exception strings. Long-lived API keys
are intended for trusted server use, not embedding in distributed Flutter or
browser apps. Injected transports must honor cancellation and redirect policies.
Browser runtime behavior is not claimed as verified by VM tests.

Separate Dart CI runs formatting, strict analysis, tests, and a live Nest smoke
test; pnpm check remains the TypeScript repository check. Package publication is
disabled until a deliberate release review. Neither pub.dev nor npm publication
is authorized by this milestone.

References:
[official package creation](https://dart.dev/tools/pub/create-packages),
[abortable requests](https://pub.dev/documentation/http/latest/http/AbortableRequest-class.html).
