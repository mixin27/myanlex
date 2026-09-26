"""Real Nest API contract smoke, run by scripts/python-sdk-smoke.mjs."""

import asyncio
import os

from myanlex import AsyncMyanLex, BatchItem, MyanLex, MyanLexApiError


def cases():
    return [
        ("health", {}, lambda r: r.status == "ok"),
        ("detect", {"text": "မြန်မာ"}, lambda r: r.profile == "zawgyi-unicode-v1"),
        ("normalize", {"text": "က😀"}, lambda r: r.output == "က😀"),
        (
            "convert",
            {"text": "က", "from_encoding": "unicode", "to_encoding": "unicode"},
            lambda r: r.output == "က",
        ),
        ("syllabify", {"text": "က😀"}, lambda r: r.segments[-1].end == 2),
        ("validate_orthography", {"text": "က"}, lambda r: r.valid),
        ("transliterate", {"text": "က"}, lambda r: r.complete),
        ("tokenize", {"text": "က😀"}, lambda r: r.tokens[-1].end == 2),
        (
            "batch_syllabify",
            {
                "items": [
                    BatchItem(id="ok", text="က"),
                    BatchItem(id="bad", text="\ud800"),
                ]
            },
            lambda r: r.results[0].success and not r.results[1].success,
        ),
        (
            "batch_transliterate",
            {"items": [BatchItem(id="ok", text="က")]},
            lambda r: r.results[0].success,
        ),
    ]


options = {
    "api_key": os.environ["MYANLEX_SMOKE_KEY"],
    "base_url": os.environ["MYANLEX_SMOKE_URL"],
}
mixed = "သီဟိုဠ်မှ ဉာဏ်ကြီးရှင်သည် အာယုဝၯနေဆးၫႊန္းစာကို"

with MyanLex(**options) as client:
    for method, args, check in cases():
        assert check(getattr(client, method)(**args)), method
    try:
        client.convert(
            text=mixed,
            from_encoding="zawgyi",
            to_encoding="unicode",
            validate_source=True,
        )
        raise AssertionError("Mixed source should be rejected")
    except MyanLexApiError as error:
        assert error.status == 400 and error.code == "encoding_mixed"


async def main():
    async with AsyncMyanLex(**options) as client:
        for method, args, check in cases():
            assert check(await getattr(client, method)(**args)), method
        try:
            await client.convert(
                text="က", from_encoding="invalid", to_encoding="unicode"
            )
            raise AssertionError("Invalid source should be rejected")
        except MyanLexApiError as error:
            assert error.status == 400
        try:
            await client.normalize(text="က")
            raise AssertionError("Rate limit should reject request 21")
        except MyanLexApiError as error:
            assert error.status == 429 and error.retry_after_seconds is not None


asyncio.run(main())
print(
    "Python SDK: sync/async endpoints, guarded conversion, batch failures, offsets and rate limiting passed."
)
