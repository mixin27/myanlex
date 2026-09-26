"""Explicit synchronous and asynchronous API clients; no automatic retries."""

from collections.abc import Sequence
from types import TracebackType
from typing import TypeVar

import httpx

from ._transport import Configuration, decode
from .errors import MyanLexRequestError
from .models import (
    BatchItem,
    BatchResult,
    ConversionResult,
    DetectionResult,
    HealthResult,
    Model,
    NormalizationResult,
    OrthographyResult,
    SyllabificationResult,
    TokenizationResult,
    TransliterationResult,
)

T = TypeVar("T", bound=Model)


class MyanLex:
    """Owns its HTTP client and supplied transport. Use a context manager."""

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = "https://api.myanlex.dev/v1",
        timeout: float = 30.0,
        transport: httpx.BaseTransport | None = None,
    ):
        self._config = Configuration(api_key, base_url, timeout)
        self._client = httpx.Client(
            timeout=timeout,
            follow_redirects=False,
            trust_env=False,
            transport=transport,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "MyanLex":
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.close()

    def _request(self, path: str, body: dict[str, object] | None, model: type[T]) -> T:
        if self._client.is_closed:
            raise MyanLexRequestError("closed")
        try:
            response = self._client.send(self._config.request(path, body))
        except httpx.TimeoutException:
            raise MyanLexRequestError("timeout") from None
        except httpx.HTTPError:
            raise MyanLexRequestError("transport_failure") from None
        try:
            return decode(response, model)
        finally:
            response.close()

    def health(self) -> HealthResult:
        return self._request("health", None, HealthResult)

    def detect(self, *, text: str) -> DetectionResult:
        return self._request("text/detect", {"text": text}, DetectionResult)

    def normalize(self, *, text: str) -> NormalizationResult:
        return self._request("text/normalize", {"text": text}, NormalizationResult)

    def convert(
        self,
        *,
        text: str,
        from_encoding: str,
        to_encoding: str,
        validate_source: bool | None = None,
    ) -> ConversionResult:
        return self._request(
            "text/convert",
            {
                "text": text,
                "from": from_encoding,
                "to": to_encoding,
                **(
                    {}
                    if validate_source is None
                    else {"validateSource": validate_source}
                ),
            },
            ConversionResult,
        )

    def syllabify(self, *, text: str) -> SyllabificationResult:
        return self._request("syllabify", {"text": text}, SyllabificationResult)

    def validate_orthography(self, *, text: str) -> OrthographyResult:
        return self._request("orthography/validate", {"text": text}, OrthographyResult)

    def transliterate(
        self, *, text: str, scheme: str = "ala-lc-2011"
    ) -> TransliterationResult:
        return self._request(
            "transliterate", {"text": text, "scheme": scheme}, TransliterationResult
        )

    def tokenize(self, *, text: str) -> TokenizationResult:
        return self._request("tokenize", {"text": text}, TokenizationResult)

    def batch_syllabify(
        self, *, items: Sequence[BatchItem]
    ) -> BatchResult[SyllabificationResult]:
        return self._request(
            "batch/syllabify",
            {"items": [item.model_dump() for item in items]},
            BatchResult[SyllabificationResult],
        )

    def batch_transliterate(
        self, *, items: Sequence[BatchItem], scheme: str = "ala-lc-2011"
    ) -> BatchResult[TransliterationResult]:
        return self._request(
            "batch/transliterate",
            {"items": [item.model_dump() for item in items], "scheme": scheme},
            BatchResult[TransliterationResult],
        )


class AsyncMyanLex:
    """Owns its HTTP client and supplied transport. Use a context manager."""

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = "https://api.myanlex.dev/v1",
        timeout: float = 30.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self._config = Configuration(api_key, base_url, timeout)
        self._client = httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=False,
            trust_env=False,
            transport=transport,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "AsyncMyanLex":
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        await self.aclose()

    async def _request(
        self, path: str, body: dict[str, object] | None, model: type[T]
    ) -> T:
        if self._client.is_closed:
            raise MyanLexRequestError("closed")
        try:
            response = await self._client.send(self._config.request(path, body))
        except httpx.TimeoutException:
            raise MyanLexRequestError("timeout") from None
        except httpx.HTTPError:
            raise MyanLexRequestError("transport_failure") from None
        try:
            return decode(response, model)
        finally:
            await response.aclose()

    async def health(self) -> HealthResult:
        return await self._request("health", None, HealthResult)

    async def detect(self, *, text: str) -> DetectionResult:
        return await self._request("text/detect", {"text": text}, DetectionResult)

    async def normalize(self, *, text: str) -> NormalizationResult:
        return await self._request(
            "text/normalize", {"text": text}, NormalizationResult
        )

    async def convert(
        self,
        *,
        text: str,
        from_encoding: str,
        to_encoding: str,
        validate_source: bool | None = None,
    ) -> ConversionResult:
        return await self._request(
            "text/convert",
            {
                "text": text,
                "from": from_encoding,
                "to": to_encoding,
                **(
                    {}
                    if validate_source is None
                    else {"validateSource": validate_source}
                ),
            },
            ConversionResult,
        )

    async def syllabify(self, *, text: str) -> SyllabificationResult:
        return await self._request("syllabify", {"text": text}, SyllabificationResult)

    async def validate_orthography(self, *, text: str) -> OrthographyResult:
        return await self._request(
            "orthography/validate", {"text": text}, OrthographyResult
        )

    async def transliterate(
        self, *, text: str, scheme: str = "ala-lc-2011"
    ) -> TransliterationResult:
        return await self._request(
            "transliterate", {"text": text, "scheme": scheme}, TransliterationResult
        )

    async def tokenize(self, *, text: str) -> TokenizationResult:
        return await self._request("tokenize", {"text": text}, TokenizationResult)

    async def batch_syllabify(
        self, *, items: Sequence[BatchItem]
    ) -> BatchResult[SyllabificationResult]:
        return await self._request(
            "batch/syllabify",
            {"items": [item.model_dump() for item in items]},
            BatchResult[SyllabificationResult],
        )

    async def batch_transliterate(
        self, *, items: Sequence[BatchItem], scheme: str = "ala-lc-2011"
    ) -> BatchResult[TransliterationResult]:
        return await self._request(
            "batch/transliterate",
            {"items": [item.model_dump() for item in items], "scheme": scheme},
            BatchResult[TransliterationResult],
        )
