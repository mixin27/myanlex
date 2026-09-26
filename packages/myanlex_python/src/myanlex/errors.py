"""Errors deliberately exclude submitted text, credentials and raw response bodies."""


class MyanLexError(Exception):
    pass


class MyanLexApiError(MyanLexError):
    def __init__(
        self,
        status: int,
        *,
        code: str | None = None,
        request_id: str | None = None,
        retry_after_seconds: float | None = None,
    ):
        self.status = status
        self.code = code
        self.request_id = request_id
        self.retry_after_seconds = retry_after_seconds
        super().__init__(f"MyanLex HTTP {status}")


class MyanLexRequestError(MyanLexError):
    def __init__(self, kind: str):
        self.kind = kind
        super().__init__(f"MyanLex request failed: {kind}")
