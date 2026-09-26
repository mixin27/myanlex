import asyncio
import json
import unittest

import httpx

from myanlex import (
    AsyncMyanLex,
    BatchItem,
    MyanLex,
    MyanLexApiError,
    MyanLexRequestError,
)
from myanlex._transport import retry_after

NORMAL = {"input": "က😀", "output": "က😀", "changed": False, "profile": "unicode-nfc"}


class ClientTests(unittest.TestCase):
    def client(self, handler):
        client = MyanLex(
            api_key="secret",
            base_url="http://localhost:3000/prefix/v1",
            transport=httpx.MockTransport(handler),
        )
        self.addCleanup(client.close)
        return client

    def test_headers_path_cookies_and_health(self):
        seen = []

        def handle(request):
            seen.append(request)
            if request.method == "GET":
                return httpx.Response(200, json={"status": "ok", "version": "1"})
            return httpx.Response(
                200, json=NORMAL, headers={"Set-Cookie": "private=value"}
            )

        client = self.client(handle)
        client.normalize(text="က😀")
        client.normalize(text="က😀")
        client.health()
        self.assertEqual(
            str(seen[0].url), "http://localhost:3000/prefix/v1/text/normalize"
        )
        self.assertEqual(seen[0].headers["Authorization"], "Bearer secret")
        self.assertEqual(json.loads(seen[0].content), {"text": "က😀"})
        self.assertNotIn("cookie", seen[1].headers)
        self.assertNotIn("authorization", seen[2].headers)
        self.assertEqual(seen[0].extensions["timeout"]["read"], 30)

    def test_convert_optional_flag_and_aliases(self):
        bodies = []

        def handle(request):
            bodies.append(json.loads(request.content))
            return httpx.Response(
                200, json={**NORMAL, "from": "unicode", "to": "zawgyi"}
            )

        client = self.client(handle)
        for flag in (None, False, True):
            result = client.convert(
                text="က",
                from_encoding="unicode",
                to_encoding="zawgyi",
                validate_source=flag,
            )
            self.assertEqual(result.from_encoding, "unicode")
        self.assertNotIn("validateSource", bodies[0])
        self.assertIs(bodies[1]["validateSource"], False)
        self.assertIs(bodies[2]["validateSource"], True)

    def test_error_status_metadata_and_no_retry(self):
        calls = []

        def handle(request):
            calls.append(request)
            return httpx.Response(
                429,
                headers={"Retry-After": "12"},
                json={
                    "status": 200,
                    "code": "rate_limited",
                    "requestId": "id",
                    "detail": "secret",
                },
            )

        with self.assertRaises(MyanLexApiError) as error:
            self.client(handle).normalize(text="private")
        self.assertEqual(error.exception.status, 429)
        self.assertEqual(error.exception.code, "rate_limited")
        self.assertEqual(error.exception.request_id, "id")
        self.assertEqual(error.exception.retry_after_seconds, 12)
        self.assertNotIn("secret", repr(error.exception))
        self.assertEqual(len(calls), 1)

    def test_redirect_and_non_json_error(self):
        for status in (302, 401, 500):
            with (
                self.subTest(status=status),
                self.assertRaises(MyanLexApiError) as error,
            ):
                self.client(
                    lambda r: httpx.Response(
                        status,
                        text="private",
                        headers={"Location": "https://elsewhere.test"},
                    )
                ).health()
            self.assertEqual(error.exception.status, status)

    def test_invalid_success_responses(self):
        for response in (
            httpx.Response(200, text="private"),
            httpx.Response(200, json={**NORMAL, "changed": "false"}),
            httpx.Response(200, json=[]),
            httpx.Response(
                200, content=b"{", headers={"content-type": "application/json"}
            ),
        ):
            with (
                self.subTest(response=response),
                self.assertRaises(MyanLexRequestError) as error,
            ):
                self.client(lambda r: response).normalize(text="private")
            self.assertEqual(error.exception.kind, "invalid_response")

    def test_timeout_transport_and_closed(self):
        for exception, kind in (
            (httpx.ReadTimeout("secret"), "timeout"),
            (httpx.ConnectError("secret"), "transport_failure"),
        ):

            def handle(request):
                raise exception

            with self.assertRaises(MyanLexRequestError) as error:
                self.client(handle).normalize(text="private")
            self.assertEqual(error.exception.kind, kind)
            self.assertNotIn("secret", str(error.exception))
        client = self.client(lambda r: httpx.Response(200, json=NORMAL))
        client.close()
        with self.assertRaises(MyanLexRequestError) as error:
            client.normalize(text="private")
        self.assertEqual(error.exception.kind, "closed")

    def test_configuration(self):
        for url in (
            "http://example.com/v1",
            "https://user:secret@example.com",
            "https://example.com?key=a",
            "https://example.com#x",
            "https://example.com\n",
            "https://",
            "https://example.com:bad",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                MyanLex(api_key="secret", base_url=url)
        for key in ("", "has space", "x\ny", "မြန်မာ"):
            with self.assertRaises(ValueError):
                MyanLex(api_key=key)
        for timeout in (0, -1, float("inf"), float("nan"), True):
            with self.assertRaises(ValueError):
                MyanLex(api_key="secret", timeout=timeout)

    def test_batch_partial_failure_and_surrogate(self):
        def handle(request):
            self.assertEqual(json.loads(request.content)["items"][1]["text"], "\ud800")
            return httpx.Response(
                200,
                json={
                    "results": [
                        {
                            "id": "a",
                            "success": True,
                            "result": {
                                "input": "က😀",
                                "profile": "future",
                                "segments": [
                                    {
                                        "kind": "future",
                                        "text": "😀",
                                        "start": 1,
                                        "end": 2,
                                    }
                                ],
                            },
                        },
                        {
                            "id": "b",
                            "success": False,
                            "error": {"code": "invalid_unicode", "message": "Invalid"},
                        },
                    ]
                },
            )

        result = self.client(handle).batch_syllabify(
            items=[BatchItem(id="a", text="က😀"), BatchItem(id="b", text="\ud800")]
        )
        self.assertEqual(result.results[0].result.segments[0].end, 2)
        self.assertFalse(result.results[1].success)
        self.assertIsInstance(result.results, tuple)

    def test_retry_after(self):
        self.assertEqual(retry_after("Wed, 21 Oct 2015 07:28:00 GMT"), 0)
        for value in (None, "invalid", "-1", "1.5"):
            self.assertIsNone(retry_after(value))


class AsyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_async_and_close(self):
        async with AsyncMyanLex(
            api_key="secret",
            transport=httpx.MockTransport(lambda r: httpx.Response(200, json=NORMAL)),
        ) as client:
            self.assertEqual((await client.normalize(text="က😀")).output, "က😀")
        with self.assertRaises(MyanLexRequestError):
            await client.normalize(text="က😀")

    async def test_cancellation(self):
        started = asyncio.Event()

        async def handle(request):
            started.set()
            await asyncio.Event().wait()

        async with AsyncMyanLex(
            api_key="secret", transport=httpx.MockTransport(handle)
        ) as client:
            task = asyncio.create_task(client.normalize(text="private"))
            await started.wait()
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
