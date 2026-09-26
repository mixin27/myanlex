# 0018: Typed Python HTTP SDK

Status: accepted for unpublished preview.

Provide `MyanLex` and `AsyncMyanLex` using HTTPX, with frozen Pydantic response
models. Keep protocol handling shared but public sync/async methods explicit for
type checkers and discoverability. The SDK consumes the HTTP contract and never
depends on or reimplements the linguistic engine.

Use Python 3.10+ and a PEP 517 src-layout package with PEP 561 typing metadata.
Expose Python snake_case names, preserving API wire aliases. Strictly validate
required response types, ignore extra fields, and accept new profile/code
strings.

Disable redirects, implicit cookies, environment proxy configuration and
retries. HTTPS is required outside exact loopback hosts. Errors preserve HTTP
status and selected metadata without putting response bodies into their
messages. HTTPX timeouts are per-phase inactivity bounds, not whole-operation
deadlines. Native async cancellation is not translated into a misleading
transport error.

Package publication remains a separate release decision. The proposed PyPI name
is not reserved. A private classifier prevents accidental upload; CI tests
Python 3.10/3.12/3.14 and installs the built wheel before real API smoke checks.

The smoke uses existing synthetic SDK samples and the mixed-encoding example
submitted by the project maintainer in the conversion discussion. These are
transport assertions, not new linguistic corpus evidence or review claims.

References: [HTTPX](https://www.python-httpx.org/async/),
[HTTPX timeouts](https://www.python-httpx.org/advanced/timeouts/),
[Pydantic releases](https://pypi.org/project/pydantic/),
[Hatchling](https://pypi.org/project/hatchling/).
