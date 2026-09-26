# MyanLex Python SDK

Unpublished preview, Python 3.10+. The proposed distribution name is
`myanlex-python`; it is not reserved or available as an official PyPI release.
The hosted API is not launched. Set an explicit base URL for your own server.

From the repository root:

```sh
python3 -m venv .cache/python-sdk-venv
.cache/python-sdk-venv/bin/python -m pip install -e 'packages/myanlex_python[dev]'
```

Consumers can install a supplied wheel without this repository:
`python -m pip install ./myanlex_python-0.0.0-py3-none-any.whl`.

```python
import os
from myanlex import MyanLex, MyanLexApiError

with MyanLex(
    api_key=os.environ["MYANLEX_API_KEY"], base_url=os.environ["MYANLEX_API_URL"]
) as client:
    result = client.syllabify(text="က😀")
    assert result.segments[-1].end == 2
```

`AsyncMyanLex` has the same methods, awaited inside `async with`:

```python
from myanlex import AsyncMyanLex


async def normalize_text(text: str) -> str:
    async with AsyncMyanLex(
        api_key=os.environ["MYANLEX_API_KEY"], base_url=os.environ["MYANLEX_API_URL"]
    ) as client:
        return (await client.normalize(text=text)).output
```

Reuse a client across requests in a service; close it at shutdown. The SDK owns
and closes its HTTPX client and any explicitly supplied transport.

## Methods and contracts

- `health()` is public and sends no API key.
- `detect(text=...)`, `normalize(text=...)`, `syllabify(text=...)`,
  `validate_orthography(text=...)`, `tokenize(text=...)`.
- `convert(text=..., from_encoding='zawgyi', to_encoding='unicode', validate_source=True)`.
- `transliterate(text=..., scheme='ala-lc-2011')`.
- `batch_syllabify(items=[BatchItem(id='a', text='က')])` and
  `batch_transliterate(items=..., scheme='ala-lc-2011')`.

Results are frozen Pydantic models, with immutable tuples for arrays. Full model
types are available under `myanlex.models`. Python attributes use snake_case;
`model_dump(by_alias=True)` restores wire names. Unknown response fields are
ignored; profile/code/kind strings remain forward-compatible. Required fields
and field types are checked, not linguistic correctness.

Offsets are half-open Unicode code-point offsets, matching Python string
indexing for valid Unicode. They are not grapheme offsets. A batch can return
HTTP 200 with individual `success=False` items; inspect each item before using
`.result`.

Conversion is explicit, not automatic mixed-text repair. `validate_source=True`
asks the server to reject mixed, mismatched or uncertain sources. Omitting it
retains the unchecked API default; `False` is forwarded explicitly.
Same-encoding requests remain no-ops. Keep originals and require review of
ambiguous input.

## Reliability and security

HTTPS is required except localhost, 127.0.0.1 and ::1. Base URLs cannot contain
credentials, query strings or fragments and should include `/v1`. Redirects,
automatic retries, environment proxies and cookie replay are disabled. API keys
belong on trusted backends, never in browser bundles.

`timeout=30.0` is an HTTPX connect/read/write/pool inactivity timeout, **not a
whole-operation deadline**. For a total async deadline use `asyncio.wait_for`.
Task cancellation propagates normally. A timeout or cancellation does not prove
the server stopped processing or that quota was not consumed. See
[HTTPX timeout semantics](https://www.python-httpx.org/advanced/timeouts/).

`MyanLexApiError` exposes authoritative HTTP `status`, optional `code`,
`request_id` and `retry_after_seconds` (delta seconds or HTTP date). Non-JSON
error responses still preserve their status. `MyanLexRequestError.kind` is
`timeout`, `transport_failure`, `invalid_response` or `closed`. Error messages
exclude response bodies and submitted text; optional error metadata is
server-controlled. Do not log models, request headers, transport debug data or
traceback locals containing private input or credentials.

## Contributor checks

```sh
.cache/python-sdk-venv/bin/python -m unittest discover -s packages/myanlex_python/tests -v
.cache/python-sdk-venv/bin/ruff check packages/myanlex_python
.cache/python-sdk-venv/bin/ruff format --check packages/myanlex_python
.cache/python-sdk-venv/bin/mypy --config-file packages/myanlex_python/pyproject.toml packages/myanlex_python/src
.cache/python-sdk-venv/bin/python -m build packages/myanlex_python
MYANLEX_PYTHON="$PWD/.cache/python-sdk-venv/bin/python" pnpm python:sdk:smoke
```

No registry publishing workflow is configured. Remove the private classifier
only as part of an intentional package-release review. This SDK does not change
MyanLex's beta linguistic limitations or outstanding independent review.
