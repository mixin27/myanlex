import json
import math
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import TypeVar
from urllib.parse import urlsplit

import httpx
from pydantic import ValidationError

from .errors import MyanLexApiError, MyanLexRequestError
from .models import Model

T = TypeVar("T", bound=Model)


class Configuration:
    def __init__(self, api_key: str, base_url: str, timeout: float):
        if not api_key or any(ord(c) < 33 or ord(c) > 126 for c in api_key):
            raise ValueError(
                "api_key must be nonempty visible ASCII without whitespace"
            )
        try:
            url = urlsplit(base_url)
            valid = url.scheme == "https" or (
                url.scheme == "http"
                and url.hostname in {"localhost", "127.0.0.1", "::1"}
            )
            valid = (
                valid and bool(url.hostname) and not url.username and not url.password
            )
            valid = (
                valid
                and not url.query
                and not url.fragment
                and "?" not in base_url
                and "#" not in base_url
            )
            valid = valid and not any(ord(c) <= 32 or ord(c) == 127 for c in base_url)
            valid = valid and "\\" not in base_url and "@" not in url.netloc
            _ = url.port
        except ValueError:
            valid = False
        if not valid:
            raise ValueError(
                "base_url must use HTTPS (HTTP only on loopback), without credentials, query or fragment"
            )
        if isinstance(timeout, bool) or not math.isfinite(timeout) or timeout <= 0:
            raise ValueError("timeout must be a finite positive number")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def request(self, path: str, body: dict[str, object] | None) -> httpx.Request:
        headers = {"Accept": "application/json"}
        content = None
        if body is not None:
            headers["Authorization"] = f"Bearer {self.api_key}"
            headers["Content-Type"] = "application/json"
            content = json.dumps(body, ensure_ascii=True, allow_nan=False).encode(
                "ascii"
            )
        # A fresh Request bypasses client cookie/header merging, including cookies
        # received on earlier calls. Explicit timeout extensions preserve timeouts.
        return httpx.Request(
            "GET" if body is None else "POST",
            f"{self.base_url}/{path}",
            headers=headers,
            content=content,
            extensions={"timeout": httpx.Timeout(self.timeout).as_dict()},
        )


def retry_after(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        if value.isascii() and value.isdigit():
            seconds = float(value)
            return seconds if math.isfinite(seconds) else None
        date = parsedate_to_datetime(value)
        if date.tzinfo is None:
            return None
        return max(0, (date - datetime.now(timezone.utc)).total_seconds())
    except (ValueError, TypeError, OverflowError):
        return None


def decode(response: httpx.Response, model: type[T]) -> T:
    if not 200 <= response.status_code < 300:
        code = request_id = None
        try:
            problem = response.json()
            if isinstance(problem, dict):
                code = problem.get("code")
                request_id = problem.get("requestId")
        except ValueError:
            pass
        raise MyanLexApiError(
            response.status_code,
            code=code if isinstance(code, str) else None,
            request_id=request_id if isinstance(request_id, str) else None,
            retry_after_seconds=retry_after(response.headers.get("retry-after")),
        )
    media_type = (
        response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    )
    if media_type != "application/json" and not (
        media_type.startswith("application/") and media_type.endswith("+json")
    ):
        raise MyanLexRequestError("invalid_response")
    try:
        return model.model_validate_json(response.content)
    except (ValidationError, ValueError):
        raise MyanLexRequestError("invalid_response") from None
